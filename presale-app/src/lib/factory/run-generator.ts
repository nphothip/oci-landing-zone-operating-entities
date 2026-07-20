import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FactoryConfig, LacFile } from "@/lib/domain/types";

// Runs the repo's Blueprint Factory ("config mode") for one request.
//
// gen/generate.sh --config <file> [out_dir] boils down to (lines 101–107):
//   jsonnet --multi "$OUT/" --tla-code-file "config=$CONFIG" gen/landing_zone_multi.jsonnet
//   python3 gen/format_json.py < each_output > each_output
// We invoke jsonnet + python directly so the pipeline also works on Windows
// dev machines (the checked-out .sh may carry CRLF and bash is not required
// at runtime). The Docker image and local dev both use this same path.

export type GeneratorResult =
  | { ok: true; files: LacFile[] }
  | { ok: false; stage: "config" | "generator" | "environment"; message: string };

function repoRoot(): string {
  return process.env.REPO_ROOT || path.resolve(process.cwd(), "..");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveJsonnet(): Promise<string | null> {
  if (process.env.JSONNET_BIN) return process.env.JSONNET_BIN;
  // Probe a `go install`-ed binary before falling back to PATH lookup.
  const goBin = path.join(os.homedir(), "go", "bin", process.platform === "win32" ? "jsonnet.exe" : "jsonnet");
  if (await exists(goBin)) return goBin;
  return "jsonnet"; // rely on PATH (Docker image)
}

function pythonBin(): string {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

interface RunOutput {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], opts: { cwd?: string; stdin?: string; timeoutMs: number }): Promise<RunOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(cmd)} timed out after ${opts.timeoutMs} ms`));
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin);
    }
    child.stdin.end();
  });
}

// Bound concurrent generator runs (jsonnet is CPU-heavy).
let active = 0;
const waiters: (() => void)[] = [];
async function acquire(): Promise<void> {
  if (active < 2) {
    active += 1;
    return;
  }
  await new Promise<void>((res) => waiters.push(res));
  active += 1;
}
function release(): void {
  active -= 1;
  waiters.shift()?.();
}

export async function runGenerator(config: FactoryConfig): Promise<GeneratorResult> {
  const root = repoRoot();
  const entrypoint = path.join(root, "gen", "landing_zone_multi.jsonnet");
  const formatter = path.join(root, "gen", "format_json.py");
  if (!(await exists(entrypoint))) {
    return {
      ok: false,
      stage: "environment",
      message: `gen/landing_zone_multi.jsonnet not found under REPO_ROOT (${root}). Set the REPO_ROOT env var to the oci-landing-zone-operating-entities checkout.`,
    };
  }
  const jsonnet = await resolveJsonnet();
  if (!jsonnet) {
    return { ok: false, stage: "environment", message: "jsonnet binary not found (set JSONNET_BIN or install go-jsonnet)" };
  }

  const timeoutMs = Number(process.env.GENERATOR_TIMEOUT_MS || 60_000);
  await acquire();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "presale-"));
  try {
    const cfgPath = path.join(tmp, "config.json");
    const outDir = path.join(tmp, "out");
    await writeFile(cfgPath, JSON.stringify(config, null, 2));
    await mkdir(outDir, { recursive: true }); // generate.sh does mkdir -p before jsonnet --multi

    let result: RunOutput;
    try {
      result = await run(
        jsonnet,
        ["--multi", outDir + path.sep, "--tla-code-file", `config=${cfgPath}`, entrypoint],
        { cwd: root, timeoutMs },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT")) {
        return { ok: false, stage: "environment", message: `cannot execute jsonnet (${jsonnet}) — install go-jsonnet or set JSONNET_BIN` };
      }
      return { ok: false, stage: "generator", message: msg };
    }
    if (result.code !== 0) {
      // jsonnet assertion messages are written for humans — surface verbatim.
      const line =
        result.stderr
          .split("\n")
          .find((l) => l.includes("RUNTIME ERROR") || l.trim().length > 0)
          ?.replace(/^RUNTIME ERROR:\s*/, "") || "generator failed";
      return { ok: false, stage: "generator", message: line.trim() };
    }

    const names = (await readdir(outDir)).filter((f) => f.endsWith(".json")).sort();
    const files: LacFile[] = [];
    for (const name of names) {
      const raw = await readFile(path.join(outDir, name), "utf8");
      let content = raw;
      if (await exists(formatter)) {
        try {
          const fmt = await run(pythonBin(), [formatter], { cwd: root, stdin: raw, timeoutMs: 15_000 });
          if (fmt.code === 0 && fmt.stdout.trim().length > 0) content = fmt.stdout;
        } catch {
          // formatting is cosmetic — keep raw JSON on any failure
        }
      }
      files.push({ path: `generated/${name}`, content });
    }
    if (files.length === 0) {
      return { ok: false, stage: "generator", message: "generator produced no output files" };
    }
    return { ok: true, files };
  } finally {
    release();
    rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
