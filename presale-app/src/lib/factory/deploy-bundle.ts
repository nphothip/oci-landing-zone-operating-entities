import type { LacFile, SolutionSpec } from "@/lib/domain/types";

// Deploy-ready bundle appended to every LaC package. Implements the CANONICAL
// deployment contract of the repo (commons/content/terraform.md): clone the
// OCI Landing Zones Orchestrator (pinned v2.1.3), terraform init inside it,
// then plan/apply passing each generated JSON as -var-file. The generated
// JSONs are tfvars documents — their top-level keys ARE orchestrator root
// variables, and duplicate families are NOT deep-merged (later -var-file
// wins), so a *_pre file and its final counterpart must never share a run.

const ORCH_REF = "v2.1.3";
const NFW_PLACEHOLDER = "OCI NFW PRIVATE IP OCID";

/** Stage-1 file set: X_pre.json where it exists, else X.json.
 *  network_backends.json (Hub C) is stage-2 content — its third-party firewall
 *  backends are registered BETWEEN the stages. */
function stage1Files(names: string[]): string[] {
  return names.filter(
    (n) => n !== "network_backends.json" && (n.endsWith("_pre.json") || !names.includes(n.replace(/\.json$/, "_pre.json"))),
  );
}
function stage2Files(names: string[]): string[] {
  return names.filter((n) => !n.endsWith("_pre.json"));
}

export function buildDeployBundle(spec: SolutionSpec, generatedNames: string[]): LacFile[] {
  const staged = generatedNames.some((n) => n.includes("_pre"));
  const s1 = stage1Files(generatedNames);
  const s2 = stage2Files(generatedNames);
  const hub = spec.hub.kind;

  const deployMd = `# Deploying this Landing Zone package

This package deploys with the **OCI Landing Zones Orchestrator**
(https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator, validated
against **${ORCH_REF}**). The files under \`generated/\` are Terraform *var-files*:
their top-level keys are orchestrator root variables.

> คู่มือฉบับย่อ: แตก ZIP นี้ → เตรียม credentials → รัน \`deploy.sh\` (หรือ
> \`deploy.ps1\` บน Windows) ตามขั้นตอนด้านล่าง — ใช้ได้ทันทีไม่ต้องแก้โครงสร้างไฟล์

## Prerequisites

- Terraform **>= 1.5.x** and \`git\` on your PATH
- An OCI API signing key for a user with administrator rights in the target
  tenancy (home region). Copy \`deploy/oci-credentials.tfvars.json.template\`
  to \`oci-credentials.tfvars.json\` **in the package root** and fill in:
  \`tenancy_ocid\`, \`user_ocid\`, \`fingerprint\`, \`private_key_path\`, \`region\`.
- (Resource Manager path only) OCI CLI configured, or use the OCI Console.

## Option A — local Terraform (recommended first deploy)

\`\`\`bash
cd <unzipped-package>
cp deploy/oci-credentials.tfvars.json.template oci-credentials.tfvars.json
#   ...fill in the credential values...
bash deploy/deploy.sh init        # clones the orchestrator ${ORCH_REF} + terraform init
bash deploy/deploy.sh plan        # review the plan before touching the tenancy
${staged ? `bash deploy/deploy.sh stage1      # Step 1: *_pre files + iam/governance` : `bash deploy/deploy.sh apply       # single-run apply (no *_pre files in this package)`}
\`\`\`
${staged
    ? `
### Between Step 1 and Step 2 (${hub === "hub_c" ? "Hub C" : "Hub A/B"})

${hub === "hub_c"
      ? `Register the third-party firewall backends (see \`network_backends.json\` and the
One-OE runtime guide) before applying Step 2.`
      : `Step 1 creates the OCI Network Firewall(s)${hub === "hub_a" ? " (two: DMZ + Internal)" : ""}.
Copy each firewall's **private-IP OCID** and replace every route-rule
\`network_entity_id\` still set to the literal placeholder
\`"${NFW_PLACEHOLDER}, e.g. ocid1.privateip..."\` inside \`generated/network.json\`.`}

\`\`\`bash
bash deploy/deploy.sh stage2      # Step 2: final files, same terraform state
\`\`\`

**Step 1 applies:** ${s1.join(", ")}
**Step 2 applies:** ${s2.join(", ")}
`
    : `
**Single run applies:** ${s2.join(", ")}
`}
On Windows use \`deploy\\deploy.ps1 init|plan|${staged ? "stage1|stage2" : "apply"}\` (PowerShell) with the
same flow.

## Option B — OCI Resource Manager (ORM)

The ORM stack code is the **orchestrator release zip** (working directory
\`rms-facade\`, Terraform 1.5.x) — NOT a zip of these JSON files. The generated
files are referenced by the \`input_config_files_urls\` variable (comma-separated
URLs) or read from a private OCI Object Storage bucket
(\`configuration_source = "ocibucket"\`). Host \`generated/*.json\` in a private
bucket (recommended) or via pre-authenticated requests, then follow
\`deploy/orm-stack.md\` for the exact OCI CLI commands${staged ? " — Stage 2 updates the SAME stack, swapping each *_pre URL for its final counterpart" : ""}.

Console shortcut: create the stack from
\`https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/archive/refs/tags/${ORCH_REF}.zip\`,
working directory \`rms-facade\`, un-check run-apply, then Plan → review → Apply.

## Operational notes

- Terraform state from local runs lives in \`.orchestrator/\` next to the package —
  move it to an OCI Object Storage backend for production. ORM manages state
  per stack; ${staged ? "Stage 2 must reuse the SAME stack/state." : "keep one stack per landing zone."}
- Never pass a \`*_pre.json\` and its final counterpart in the same run: var-files
  do not deep-merge; the later file silently wins.
- Re-generate after config changes: \`bash gen/generate.sh --config config.json generated\`
  from the repo root, then re-run the plan.
`;

  const credsTemplate = `{
  "fingerprint": "<PEM key fingerprint, e.g. 25:84:...>",
  "private_key_path": "~/.oci/oci_api_key.pem",
  "tenancy_ocid": "ocid1.tenancy.oc1..aaaaaaaa...",
  "user_ocid": "ocid1.user.oc1..aaaaaaaa...",
  "region": "${spec.region.id}",
  "private_key_password": ""
}
`;

  const deploySh = `#!/usr/bin/env bash
# deploy.sh — deploy the generated Landing Zone with local Terraform, following
# the canonical flow (commons/content/terraform.md of the OCI Open LZ repo):
# clone the OCI Landing Zones Orchestrator (${ORCH_REF}), terraform init inside
# it, then plan/apply passing the generated JSON files as -var-file inputs.
#
# Usage (run from anywhere; paths resolve relative to this script):
#   bash deploy/deploy.sh init            # clone orchestrator + terraform init
#   bash deploy/deploy.sh plan  [1|2]     # plan stage 1 or 2 (default: auto)
#   bash deploy/deploy.sh stage1          # apply step 1 (*_pre + iam/governance)
#   bash deploy/deploy.sh stage2          # apply step 2 (final files) — same state
#   bash deploy/deploy.sh apply           # single-run apply (no *_pre files)
#   bash deploy/deploy.sh destroy
set -euo pipefail

ORCH_REPO="https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator.git"
ORCH_REF="${ORCH_REF}"
BUNDLE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"   # package root
GEN_DIR="$BUNDLE_DIR/generated"
ORCH_DIR="$BUNDLE_DIR/.orchestrator"
CREDS="$BUNDLE_DIR/oci-credentials.tfvars.json"
PLACEHOLDER="${NFW_PLACEHOLDER}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$GEN_DIR" ] || die "generated/ not found at $GEN_DIR"
command -v terraform >/dev/null || die "terraform not found on PATH (use >= 1.5.x)"

# Select var-files for a stage: stage1 = X_pre.json where present, else X.json;
# stage2 = only final (non *_pre) files. network_backends.json (Hub C) is
# stage-2 content — its backends are registered between the stages.
collect() { # $1 = 1|2
  local f base pre
  for f in "$GEN_DIR"/*.json; do
    base="$(basename "$f")"
    if [ "$1" = "1" ]; then
      [ "$base" = "network_backends.json" ] && continue
      if [[ "$base" == *_pre.json ]]; then echo "$f"
      else
        pre="\${f%.json}_pre.json"
        [ -f "$pre" ] || echo "$f"
      fi
    else
      [[ "$base" == *_pre.json ]] || echo "$f"
    fi
  done
}

has_pre() { compgen -G "$GEN_DIR/*_pre.json" >/dev/null; }

var_args() { # $1 = stage
  VARFILES=()
  [ -f "$CREDS" ] || die "credentials var-file missing: $CREDS (copy deploy/oci-credentials.tfvars.json.template and fill it in)"
  VARFILES+=(-var-file "$CREDS")
  while IFS= read -r f; do VARFILES+=(-var-file "$f"); done < <(collect "$1")
}

tf() { terraform -chdir="$ORCH_DIR" "$@"; }

cmd="\${1:-}"; shift || true
case "$cmd" in
  init)
    if [ ! -d "$ORCH_DIR" ]; then
      echo "==> Cloning OCI Landing Zones Orchestrator ($ORCH_REF)"
      git clone --depth 1 --branch "$ORCH_REF" "$ORCH_REPO" "$ORCH_DIR"
    fi
    echo "==> terraform init"
    tf init
    ;;
  plan)
    stage="\${1:-}"; [ -n "$stage" ] || { has_pre && stage=1 || stage=2; }
    var_args "$stage"
    echo "==> terraform plan (stage $stage), var-files:"; collect "$stage" | sed 's/^/    /'
    tf plan "\${VARFILES[@]}"
    ;;
  stage1)
    has_pre || die "no *_pre.json files — this package is single-run; use 'deploy.sh apply'"
    var_args 1
    echo "==> STEP 1: applying *_pre files together with iam/governance:"
    collect 1 | sed 's/^/    /'
    tf apply "\${VARFILES[@]}"
    echo ""
    echo "==> STEP 1 done. BEFORE stage2:"
    echo "    Hub A/B: edit generated/network.json and replace every route-rule"
    echo "    network_entity_id still set to the placeholder"
    echo "    \\"$PLACEHOLDER, e.g. ocid1.privateip...\\" with the private-IP OCID"
    echo "    of the Network Firewall(s) created in Step 1."
    echo "    Hub C: register third-party firewall backends instead."
    ;;
  stage2)
    if grep -qs "$PLACEHOLDER" "$GEN_DIR"/network.json; then
      die "generated/network.json still contains the '$PLACEHOLDER...' placeholder. Replace it with the firewall private-IP OCID(s) from Step 1 first."
    fi
    var_args 2
    echo "==> STEP 2: re-applying with final files (same terraform state):"
    collect 2 | sed 's/^/    /'
    tf apply "\${VARFILES[@]}"
    ;;
  apply)
    has_pre && die "*_pre.json files present — use 'deploy.sh stage1' then 'deploy.sh stage2'"
    var_args 2
    echo "==> Single-run apply, var-files:"; collect 2 | sed 's/^/    /'
    tf apply "\${VARFILES[@]}"
    ;;
  destroy)
    var_args 2
    tf destroy "\${VARFILES[@]}"
    ;;
  *)
    grep '^#   ' "$0" | sed 's/^#   //'
    exit 1
    ;;
esac

echo "==> Done. Note: terraform state lives in $ORCH_DIR — use an OCI Object Storage backend for production."
`;

  const deployPs1 = `# deploy.ps1 — deploy the generated Landing Zone with local Terraform
# (Windows PowerShell 5.1 compatible). Mirrors deploy.sh: clones the
# OCI Landing Zones Orchestrator ${ORCH_REF} and runs terraform with one
# -var-file per generated JSON (canonical flow of commons/content/terraform.md).
#
# Usage: .\\deploy\\deploy.ps1 init | plan [-Stage 1|2] | stage1 | stage2 | apply | destroy
param(
  [Parameter(Mandatory = $true)][ValidateSet("init", "plan", "stage1", "stage2", "apply", "destroy")]
  [string]$Command,
  [int]$Stage = 0
)

$ErrorActionPreference = "Stop"
$OrchRepo = "https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator.git"
$OrchRef = "${ORCH_REF}"
$BundleDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)  # package root
$GenDir = Join-Path $BundleDir "generated"
$OrchDir = Join-Path $BundleDir ".orchestrator"
$Creds = Join-Path $BundleDir "oci-credentials.tfvars.json"
$Placeholder = "${NFW_PLACEHOLDER}"

function Fail($msg) { Write-Error $msg; exit 1 }

if (-not (Test-Path $GenDir)) { Fail "generated/ not found at $GenDir" }
if ($null -eq (Get-Command terraform -ErrorAction SilentlyContinue)) { Fail "terraform not found on PATH (use >= 1.5.x)" }

function Get-VarFiles([int]$s) {
  $all = Get-ChildItem $GenDir -Filter *.json
  $out = @()
  foreach ($f in $all) {
    $isPre = $f.Name -like "*_pre.json"
    if ($s -eq 1) {
      if ($f.Name -eq "network_backends.json") { continue }  # Hub C: stage-2 content
      if ($isPre) { $out += $f.FullName }
      else {
        $pre = Join-Path $GenDir ($f.Name -replace "\\.json$", "_pre.json")
        if (-not (Test-Path $pre)) { $out += $f.FullName }
      }
    }
    elseif (-not $isPre) { $out += $f.FullName }
  }
  return $out
}

function Has-Pre { return (@(Get-ChildItem $GenDir -Filter *_pre.json).Count -gt 0) }

function Build-Args([int]$s) {
  if (-not (Test-Path $Creds)) { Fail "credentials var-file missing: $Creds (copy deploy/oci-credentials.tfvars.json.template and fill it in)" }
  $a = @("-var-file", $Creds)
  foreach ($f in (Get-VarFiles $s)) { $a += @("-var-file", $f) }
  return $a
}

function TF([string[]]$tfArgs) {
  & terraform -chdir="$OrchDir" @tfArgs
  if ($LASTEXITCODE -ne 0) { Fail "terraform exited with code $LASTEXITCODE" }
}

switch ($Command) {
  "init" {
    if (-not (Test-Path $OrchDir)) {
      Write-Host "==> Cloning OCI Landing Zones Orchestrator ($OrchRef)"
      git clone --depth 1 --branch $OrchRef $OrchRepo $OrchDir
      if ($LASTEXITCODE -ne 0) { Fail "git clone failed" }
    }
    Write-Host "==> terraform init"
    TF @("init")
  }
  "plan" {
    $s = $Stage; if ($s -eq 0) { if (Has-Pre) { $s = 1 } else { $s = 2 } }
    Write-Host "==> terraform plan (stage $s), var-files:"; Get-VarFiles $s | ForEach-Object { "    $_" }
    TF (@("plan") + (Build-Args $s))
  }
  "stage1" {
    if (-not (Has-Pre)) { Fail "no *_pre.json files - this package is single-run; use 'deploy.ps1 apply'" }
    Write-Host "==> STEP 1: applying *_pre files together with iam/governance:"
    Get-VarFiles 1 | ForEach-Object { "    $_" }
    TF (@("apply") + (Build-Args 1))
    Write-Host ""
    Write-Host "==> STEP 1 done. BEFORE stage2:"
    Write-Host "    Hub A/B: edit generated\\network.json and replace every route-rule"
    Write-Host "    network_entity_id still set to the placeholder"
    Write-Host "    '$Placeholder, e.g. ocid1.privateip...' with the private-IP OCID"
    Write-Host "    of the Network Firewall(s) created in Step 1."
    Write-Host "    Hub C: register third-party firewall backends instead."
  }
  "stage2" {
    $net = Join-Path $GenDir "network.json"
    if ((Test-Path $net) -and (Select-String -Path $net -Pattern $Placeholder -SimpleMatch -Quiet)) {
      Fail "generated\\network.json still contains the '$Placeholder...' placeholder. Replace it with the firewall private-IP OCID(s) from Step 1 first."
    }
    Write-Host "==> STEP 2: re-applying with final files (same terraform state):"
    Get-VarFiles 2 | ForEach-Object { "    $_" }
    TF (@("apply") + (Build-Args 2))
  }
  "apply" {
    if (Has-Pre) { Fail "*_pre.json files present - use 'deploy.ps1 stage1' then 'deploy.ps1 stage2'" }
    Write-Host "==> Single-run apply, var-files:"; Get-VarFiles 2 | ForEach-Object { "    $_" }
    TF (@("apply") + (Build-Args 2))
  }
  "destroy" {
    TF (@("destroy") + (Build-Args 2))
  }
}

Write-Host "==> Done. Terraform state lives in $OrchDir - use an OCI Object Storage backend for production."
`;

  const ormMd = `# OCI Resource Manager (ORM) deployment

The ORM stack code is the orchestrator release zip (working directory
\`rms-facade\`, Terraform 1.5.x). The generated JSONs are passed by URL via the
\`input_config_files_urls\` variable — host them in a **private OCI bucket**
(recommended) or per-object pre-authenticated requests.

\`\`\`bash
# 0) Host the generated files
NS=$(oci os ns get --query data --raw-output)
oci os bucket create --name lz-config --compartment-id "$COMPARTMENT_OCID"
for f in generated/*.json; do
  oci os object put --namespace "$NS" --bucket-name lz-config --name "$(basename "$f")" --file "$f" --force
done

# 1) Download the pinned orchestrator release zip
curl -L -o orchestrator-${ORCH_REF}.zip \\
  https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/archive/refs/tags/${ORCH_REF}.zip

# 2) Create the stack (variables: stage-1 file URLs${staged ? "" : " — this package is single-run"})
cat > stack-vars.json <<'EOF'
{
  "configuration_source": "url",
  "input_config_files_urls": "<comma-separated URLs of: ${(staged ? stage1Files(generatedNames) : stage2Files(generatedNames)).join(", ")}>"
}
EOF
oci resource-manager stack create \\
  --compartment-id "$COMPARTMENT_OCID" \\
  --display-name "oci-open-lz" \\
  --config-source orchestrator-${ORCH_REF}.zip \\
  --working-directory "terraform-oci-modules-orchestrator-${ORCH_REF.replace(/^v/, "")}/rms-facade" \\
  --terraform-version "1.5.x" \\
  --variables file://stack-vars.json

# 3) Plan -> review -> apply (never auto-apply)
oci resource-manager job create-plan-job --stack-id "$STACK_ID" --display-name "lz-plan"
oci resource-manager job get-job-logs --job-id "$PLAN_JOB_ID"
oci resource-manager job create-apply-job --stack-id "$STACK_ID" \\
  --execution-plan-strategy FROM_PLAN_JOB_ID --execution-plan-job-id "$PLAN_JOB_ID" \\
  --display-name "lz-apply"
\`\`\`
${staged
      ? `
Stage 2: patch \`network.json\` (replace the "${NFW_PLACEHOLDER}..." placeholders
with the Step-1 firewall private-IP OCIDs), re-upload it, then \`oci
resource-manager stack update --stack-id "$STACK_ID" --variables file://stack-vars-stage2.json --force\`
swapping every *_pre URL for its final counterpart
(${stage2Files(generatedNames).join(", ")}), and repeat plan -> review -> apply on
the SAME stack (same state).
`
      : ""}
Console alternative: Resource Manager → Create stack → source = the orchestrator
release zip URL above → working directory \`rms-facade\` → Terraform 1.5.x →
un-check run-apply → Create → Plan → review → Apply.
`;

  return [
    { path: "deploy/DEPLOY.md", content: deployMd },
    { path: "deploy/deploy.sh", content: deploySh },
    { path: "deploy/deploy.ps1", content: deployPs1 },
    { path: "deploy/oci-credentials.tfvars.json.template", content: credsTemplate },
    { path: "deploy/orm-stack.md", content: ormMd },
  ];
}
