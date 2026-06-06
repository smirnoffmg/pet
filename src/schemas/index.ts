import type { SafeParseReturnType, ZodType } from "zod";
import type { ArtifactKind } from "./ids.js";
import { targetMetricFrontmatterSchema, type TargetMetricFrontmatter } from "./metric.js";
import { hypothesisFrontmatterSchema, type HypothesisFrontmatter } from "./hypothesis.js";
import {
  solutionHypothesisFrontmatterSchema,
  type SolutionHypothesisFrontmatter,
} from "./solution-hypothesis.js";
import { featureFrontmatterSchema, type FeatureFrontmatter } from "./feature.js";
import { releaseFrontmatterSchema, type ReleaseFrontmatter } from "./release.js";
import { devTaskFrontmatterSchema, type DevTaskFrontmatter } from "./task.js";
import { qaPlanFrontmatterSchema, type QaPlanFrontmatter } from "./qa-plan.js";

export * from "./ids.js";
export * from "./base.js";
export * from "./metric.js";
export * from "./hypothesis.js";
export * from "./solution-hypothesis.js";
export * from "./feature.js";
export * from "./release.js";
export * from "./task.js";
export * from "./qa-plan.js";

export type ArtifactFrontmatter =
  | TargetMetricFrontmatter
  | HypothesisFrontmatter
  | SolutionHypothesisFrontmatter
  | FeatureFrontmatter
  | ReleaseFrontmatter
  | DevTaskFrontmatter
  | QaPlanFrontmatter;

export const DECISION_KINDS = [
  "metric",
  "hypothesis",
  "solution_hypothesis",
  "feature",
  "release",
  "qa_plan",
] as const satisfies readonly ArtifactKind[];

export type DecisionKind = (typeof DECISION_KINDS)[number];

export function isDecisionKind(kind: ArtifactKind): kind is DecisionKind {
  return (DECISION_KINDS as readonly string[]).includes(kind);
}

const schemaByKind = {
  metric: targetMetricFrontmatterSchema,
  hypothesis: hypothesisFrontmatterSchema,
  solution_hypothesis: solutionHypothesisFrontmatterSchema,
  feature: featureFrontmatterSchema,
  release: releaseFrontmatterSchema,
  task: devTaskFrontmatterSchema,
  qa_plan: qaPlanFrontmatterSchema,
} as const;

export function frontmatterSchemaForKind(kind: ArtifactKind): ZodType {
  return schemaByKind[kind];
}

export function parseFrontmatterForKind(
  kind: ArtifactKind,
  data: unknown,
): SafeParseReturnType<unknown, ArtifactFrontmatter> {
  return schemaByKind[kind].safeParse(data) as SafeParseReturnType<unknown, ArtifactFrontmatter>;
}
