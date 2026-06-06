import { z } from "zod";

const idPattern = (prefix: string) => new RegExp(`^${prefix}-\\d{4}$`);

export const metricIdSchema = z.string().regex(idPattern("MET")).brand<"MetricId">();
export const problemHypothesisIdSchema = z
  .string()
  .regex(idPattern("PROB"))
  .brand<"ProblemHypothesisId">();
export const solutionHypothesisIdSchema = z
  .string()
  .regex(idPattern("SOL"))
  .brand<"SolutionHypothesisId">();
export const featureIdSchema = z.string().regex(idPattern("FEAT")).brand<"FeatureId">();
export const releaseIdSchema = z.string().regex(idPattern("REL")).brand<"ReleaseId">();
export const taskIdSchema = z.string().regex(idPattern("TASK")).brand<"TaskId">();
export const qaPlanIdSchema = z.string().regex(idPattern("QA")).brand<"QaPlanId">();

export const artifactIdSchema = z.union([
  metricIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  featureIdSchema,
  releaseIdSchema,
  taskIdSchema,
  qaPlanIdSchema,
]);

export type MetricId = z.infer<typeof metricIdSchema>;
export type ProblemHypothesisId = z.infer<typeof problemHypothesisIdSchema>;
export type SolutionHypothesisId = z.infer<typeof solutionHypothesisIdSchema>;
export type FeatureId = z.infer<typeof featureIdSchema>;
export type ReleaseId = z.infer<typeof releaseIdSchema>;
export type TaskId = z.infer<typeof taskIdSchema>;
export type QaPlanId = z.infer<typeof qaPlanIdSchema>;
export type ArtifactId = z.infer<typeof artifactIdSchema>;

export const ID_PREFIXES = {
  metric: "MET",
  hypothesis: "PROB",
  solution_hypothesis: "SOL",
  feature: "FEAT",
  release: "REL",
  task: "TASK",
  qa_plan: "QA",
} as const;

export type ArtifactKind = keyof typeof ID_PREFIXES;

export function idPrefixForKind(kind: ArtifactKind): string {
  return ID_PREFIXES[kind];
}

export function kindFromId(id: string): ArtifactKind | null {
  const prefix = id.split("-")[0];
  switch (prefix) {
    case "MET":
      return "metric";
    case "PROB":
      return "hypothesis";
    case "SOL":
      return "solution_hypothesis";
    case "FEAT":
      return "feature";
    case "REL":
      return "release";
    case "TASK":
      return "task";
    case "QA":
      return "qa_plan";
    default:
      return null;
  }
}

export function numericSuffixFromId(id: string): number {
  const match = /-(\d{4})$/.exec(id);
  if (!match?.[1]) {
    throw new Error(`Invalid artifact id: ${id}`);
  }
  return Number.parseInt(match[1], 10);
}
