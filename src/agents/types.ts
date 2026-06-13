import { z } from "zod";
import {
  featureIdSchema,
  metricIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  releaseIdSchema,
  taskIdSchema,
} from "@/schemas/ids.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { ParsedArtifact } from "@/store/parse.js";

export const architectBriefSchema = z.object({
  featureId: featureIdSchema,
  featureTitle: z.string().min(1),
  featureBody: z.string(),
  solutionHypothesisId: solutionHypothesisIdSchema.optional(),
  solutionHypothesisTitle: z.string().optional(),
  solutionHypothesisBody: z.string().optional(),
});

export const techLeadBriefSchema = z.object({
  featureId: featureIdSchema,
  featureTitle: z.string().min(1),
  featureBody: z.string(),
  solutionHypothesisId: solutionHypothesisIdSchema.optional(),
  solutionHypothesisTitle: z.string().optional(),
  solutionHypothesisBody: z.string().optional(),
});

export type ArchitectBrief = z.infer<typeof architectBriefSchema>;
export type TechLeadBrief = z.infer<typeof techLeadBriefSchema>;

export type SpawnArchitectCommand = {
  kind: "spawn_architect";
  brief: ArchitectBrief;
};

export type SpawnTechLeadCommand = {
  kind: "spawn_techlead";
  brief: TechLeadBrief;
};

export const analystBriefSchema = z.object({
  metricId: metricIdSchema,
  metricTitle: z.string().min(1),
  metricBody: z.string(),
});

export const researcherBriefSchema = z.object({
  hypothesisId: problemHypothesisIdSchema,
  hypothesisTitle: z.string().min(1),
  hypothesisBody: z.string(),
  context: z.string().optional(),
});

export const solutionDesignerBriefSchema = z.object({
  hypothesisId: problemHypothesisIdSchema,
  hypothesisTitle: z.string().min(1),
  hypothesisBody: z.string(),
  metrics: z.array(
    z.object({ metricId: metricIdSchema, metricTitle: z.string(), metricBody: z.string() }),
  ),
});

export const featureDesignerBriefSchema = z.object({
  solutionHypothesisId: solutionHypothesisIdSchema,
  solutionHypothesisTitle: z.string().min(1),
  solutionHypothesisBody: z.string(),
  problemHypothesisId: problemHypothesisIdSchema.optional(),
  problemHypothesisTitle: z.string().optional(),
  problemHypothesisBody: z.string().optional(),
});

export const designerEnrichBriefSchema = z.object({
  featureId: featureIdSchema,
  featureTitle: z.string().min(1),
  featureBody: z.string(),
  solutionHypothesisId: z.string().min(1),
  solutionHypothesisTitle: z.string().min(1),
  solutionHypothesisBody: z.string(),
});

export type AnalystBrief = z.infer<typeof analystBriefSchema>;
export type ResearcherBrief = z.infer<typeof researcherBriefSchema>;
export type SolutionDesignerBrief = z.infer<typeof solutionDesignerBriefSchema>;
export type FeatureDesignerBrief = z.infer<typeof featureDesignerBriefSchema>;
export type DesignerEnrichBrief = z.infer<typeof designerEnrichBriefSchema>;

export type SpawnAnalystCommand = { kind: "spawn_analyst"; brief: AnalystBrief };
export type SpawnResearcherCommand = { kind: "spawn_researcher"; brief: ResearcherBrief };
export type SpawnSolutionDesignerCommand = {
  kind: "spawn_solution_designer";
  brief: SolutionDesignerBrief;
};
export type SpawnFeatureDesignerCommand = {
  kind: "spawn_feature_designer";
  brief: FeatureDesignerBrief;
};
export type SpawnDesignerEnrichCommand = {
  kind: "spawn_designer_enrich";
  brief: DesignerEnrichBrief;
};

export const devBriefSchema = z.object({
  taskId: taskIdSchema,
  taskTitle: z.string().min(1),
  taskBody: z.string(),
  featureId: featureIdSchema,
  featureTitle: z.string().min(1),
  featureBody: z.string(),
});

export const qaBriefSchema = z.object({
  featureId: featureIdSchema,
  featureTitle: z.string().min(1),
  featureBody: z.string(),
  tasks: z.array(z.object({ taskId: taskIdSchema, taskTitle: z.string(), taskBody: z.string() })),
});

export const devOpsBriefSchema = z.object({
  releaseId: releaseIdSchema,
  releaseTitle: z.string().min(1),
  releaseBody: z.string(),
  features: z.array(
    z.object({ featureId: featureIdSchema, featureTitle: z.string(), featureBody: z.string() }),
  ),
});

export type DevBrief = z.infer<typeof devBriefSchema>;
export type QaBrief = z.infer<typeof qaBriefSchema>;
export type DevOpsBrief = z.infer<typeof devOpsBriefSchema>;

export type SpawnDevCommand = { kind: "spawn_dev"; brief: DevBrief };
export type SpawnQaCommand = { kind: "spawn_qa"; brief: QaBrief };
export type SpawnDevOpsCommand = { kind: "spawn_devops"; brief: DevOpsBrief };

export type DeliveryCommand =
  | SpawnArchitectCommand
  | SpawnTechLeadCommand
  | SpawnDevCommand
  | SpawnQaCommand
  | SpawnDevOpsCommand;
export type DiscoveryCommand =
  | SpawnAnalystCommand
  | SpawnResearcherCommand
  | SpawnSolutionDesignerCommand
  | SpawnFeatureDesignerCommand
  | SpawnDesignerEnrichCommand;

export type SubagentCommand = DeliveryCommand | DiscoveryCommand;

export type ArtifactSnapshot = {
  metrics: ParsedArtifact[];
  hypotheses: ParsedArtifact[];
  solutionHypotheses: ParsedArtifact[];
  features: ParsedArtifact[];
  tasks: ParsedArtifact[];
  releases: ParsedArtifact[];
  qaPlansByFeatureId: Map<string, ParsedArtifact[]>;
  byMetricId: Map<string, ParsedArtifact>;
  byHypothesisId: Map<string, ParsedArtifact>;
  bySolutionHypothesisId: Map<string, ParsedArtifact>;
  byFeatureId: Map<string, ParsedArtifact>;
  tasksByFeatureId: Map<string, ParsedArtifact[]>;
  byReleaseId: Map<string, ParsedArtifact>;
  metricsByHypothesisId: Map<string, ParsedArtifact[]>;
};

export type FeatureSnapshot = {
  feature: ParsedArtifact;
  frontmatter: FeatureFrontmatter;
};
