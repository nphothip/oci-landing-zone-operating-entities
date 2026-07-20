import { NextResponse } from "next/server";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { activeProvider } from "@/lib/llm/adapter";
import { getPriceBook } from "@/lib/pricing/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exec = promisify(execFile);

async function can(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: 8000, windowsHide: true });
    return (stdout || stderr).trim().split("\n")[0];
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const repoRoot = process.env.REPO_ROOT || path.resolve(process.cwd(), "..");
  const genEntry = path.join(repoRoot, "gen", "landing_zone_multi.jsonnet");
  let genOk = true;
  try {
    await access(genEntry);
  } catch {
    genOk = false;
  }

  let jsonnetBin = process.env.JSONNET_BIN || "jsonnet";
  if (!process.env.JSONNET_BIN) {
    const goBin = path.join(os.homedir(), "go", "bin", process.platform === "win32" ? "jsonnet.exe" : "jsonnet");
    try {
      await access(goBin);
      jsonnetBin = goBin;
    } catch {
      // keep PATH lookup
    }
  }
  const jsonnetVersion = await can(jsonnetBin, ["--version"]);
  const pythonBin = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const pythonVersion = await can(pythonBin, ["--version"]);

  const llm = activeProvider();
  const prices = getPriceBook();

  const ok = genOk && jsonnetVersion !== null && pythonVersion !== null;
  return NextResponse.json(
    {
      ok,
      repoRoot,
      generatorTree: genOk,
      jsonnet: jsonnetVersion,
      python: pythonVersion,
      llmProvider: llm.provider,
      llmNote: llm.reason ?? null,
      priceSource: prices.source,
      priceFetchedAt: prices.fetchedAt,
    },
    { status: ok ? 200 : 503 },
  );
}
