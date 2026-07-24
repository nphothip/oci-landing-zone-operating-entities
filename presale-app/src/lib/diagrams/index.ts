import type { DiagramDoc, LacFile, SolutionSpec } from "@/lib/domain/types";
import { parseGenerated } from "./generated-parse";
import { layoutFunctionalView } from "./layout/functional";
import { layoutSecurityView } from "./layout/security";
import { layoutNetworkView } from "./layout/network";
import { layoutOperationsView } from "./layout/operations";
import { layoutRuntimeView } from "./layout/runtime";
import { layoutGovernanceView } from "./layout/governance";
import { layoutIdentityView } from "./layout/identity";
import { layoutLoggingView } from "./layout/logflow";
import { layoutBackupView } from "./layout/backupview";
import { layoutTrafficView } from "./layout/traffic";
import { layoutResilienceView } from "./layout/resilience";
import { layoutIpPlanView } from "./layout/ipplan";
import { layoutIamMatrixView } from "./layout/iam-matrix";

/** Build all ten architecture views from the spec + generated LZ package. */
export function buildDiagrams(spec: SolutionSpec, lacFiles: LacFile[]): DiagramDoc[] {
  const gen = parseGenerated(lacFiles);
  return [
    layoutFunctionalView(spec),
    layoutSecurityView(spec, gen),
    layoutNetworkView(spec, gen),
    layoutOperationsView(spec, gen),
    layoutRuntimeView(spec, gen),
    layoutGovernanceView(spec, gen),
    layoutIdentityView(spec, gen),
    layoutLoggingView(spec, gen),
    layoutBackupView(spec, gen),
    layoutTrafficView(spec, gen),
    layoutResilienceView(spec, gen),
    layoutIpPlanView(spec, gen),
    layoutIamMatrixView(spec, gen),
  ];
}
