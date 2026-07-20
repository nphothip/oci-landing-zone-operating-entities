import type { DiagramDoc, LacFile, SolutionSpec } from "@/lib/domain/types";
import { parseGenerated } from "./generated-parse";
import { layoutFunctionalView } from "./layout/functional";
import { layoutSecurityView } from "./layout/security";
import { layoutNetworkView } from "./layout/network";
import { layoutOperationsView } from "./layout/operations";
import { layoutRuntimeView } from "./layout/runtime";

/** Build all five architecture views from the spec + generated LZ package. */
export function buildDiagrams(spec: SolutionSpec, lacFiles: LacFile[]): DiagramDoc[] {
  const gen = parseGenerated(lacFiles);
  return [
    layoutFunctionalView(spec),
    layoutSecurityView(spec, gen),
    layoutNetworkView(spec, gen),
    layoutOperationsView(spec, gen),
    layoutRuntimeView(spec, gen),
  ];
}
