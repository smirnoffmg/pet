import fs from "node:fs";
import path from "node:path";
import { input, select } from "@inquirer/prompts";
import type { ArtifactKind } from "@/schemas/ids.js";
import {
  metricIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  featureIdSchema,
  releaseIdSchema,
  taskIdSchema,
  qaPlanIdSchema,
} from "@/schemas/ids.js";
import type {
  TargetMetricFrontmatter,
  HypothesisFrontmatter,
  SolutionHypothesisFrontmatter,
  FeatureFrontmatter,
  ReleaseFrontmatter,
  DevTaskFrontmatter,
  QaPlanFrontmatter,
} from "@/schemas/index.js";
import {
  scanArtifacts,
  allocateNextId,
  writeArtifact,
  nextAdrNumber,
  adrTemplate,
  ADR_DIR,
  buildFilename,
} from "@/store/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";

type NewOptions = {
  metric?: string;
  hypothesis?: string;
  solutionHypothesis?: string;
  feature?: string;
  features?: string;
};

export async function runNew(
  kind: ArtifactKind,
  titleArg: string | undefined,
  options: NewOptions,
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scanResult = scanArtifacts(root);
  if (scanResult.isErr()) {
    console.error(scanResult.error.message);
    return 1;
  }
  const artifacts = scanResult.value;

  const title =
    titleArg ??
    (await input({
      message: "Title",
      validate: (v) => (v.trim().length > 0 ? true : "Title is required"),
    }));

  const id = allocateNextId(kind, artifacts);

  let filePath: string;
  switch (kind) {
    case "metric": {
      const fm: TargetMetricFrontmatter = {
        id: metricIdSchema.parse(id),
        status: "proposed",
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "hypothesis": {
      const fm: HypothesisFrontmatter = {
        id: problemHypothesisIdSchema.parse(id),
        status: "proposed",
        target_metric_ids: options.metric ? [metricIdSchema.parse(options.metric)] : [],
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "solution_hypothesis": {
      const hypothesisId = await resolveProblemHypothesisId(options.hypothesis, root);
      if (!hypothesisId) {
        return 1;
      }
      const metricId = await resolveMetricId(options.metric, root);
      if (!metricId) {
        return 1;
      }
      const fm: SolutionHypothesisFrontmatter = {
        id: solutionHypothesisIdSchema.parse(id),
        status: "proposed",
        problem_hypothesis_id: problemHypothesisIdSchema.parse(hypothesisId),
        target_metric_id: metricIdSchema.parse(metricId),
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "feature": {
      if (!options.solutionHypothesis) {
        console.error("Error: --solution-hypothesis <SOL-XXXX> is required for pet new feature");
        return 1;
      }
      const fm: FeatureFrontmatter = {
        id: featureIdSchema.parse(id),
        status: "proposed",
        solution_hypothesis_id: solutionHypothesisIdSchema.parse(options.solutionHypothesis),
        architectural_review_status: "pending",
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "release": {
      const featureIds = await resolveFeatureIds(options.features, root);
      if (!featureIds || featureIds.length === 0) {
        return 1;
      }
      const fm: ReleaseFrontmatter = {
        id: releaseIdSchema.parse(id),
        status: "proposed",
        feature_ids: featureIds.map((f) => featureIdSchema.parse(f)),
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "task": {
      const featureId = await resolveFeatureId(options.feature, root);
      if (!featureId) {
        return 1;
      }
      const fm: DevTaskFrontmatter = {
        id: taskIdSchema.parse(id),
        status: "todo",
        feature_id: featureIdSchema.parse(featureId),
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
    case "qa_plan": {
      const featureId = await resolveFeatureId(options.feature, root);
      if (!featureId) {
        return 1;
      }
      const fm: QaPlanFrontmatter = {
        id: qaPlanIdSchema.parse(id),
        status: "proposed",
        feature_id: featureIdSchema.parse(featureId),
      };
      const result = writeArtifact(root, kind, fm, title);
      if (result.isErr()) {
        console.error(result.error.message);
        return 1;
      }
      filePath = result.value;
      break;
    }
  }

  console.log(`Created ${filePath}`);
  console.log("Run `pet validate` to check the repository.");
  return 0;
}

export async function runNewAdr(titleArg: string | undefined): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const title =
    titleArg ??
    (await input({
      message: "Title",
      validate: (v) => (v.trim().length > 0 ? true : "Title is required"),
    }));

  const n = nextAdrNumber(root);
  const date = new Date().toISOString().slice(0, 10);
  const filename = buildFilename(n, title);
  const filePath = path.join(root, ADR_DIR, filename);

  fs.mkdirSync(path.join(root, ADR_DIR), { recursive: true });

  if (fs.existsSync(filePath)) {
    console.error(`File already exists: ${filePath}`);
    return 1;
  }

  fs.writeFileSync(filePath, adrTemplate(n, title, date), "utf8");

  console.log(`Created ${filePath}`);
  console.log("Run `pet validate` to check the repository.");
  return 0;
}

async function resolveMetricId(
  flag: string | undefined,
  docRootPath: string,
): Promise<string | null> {
  if (flag) {
    return flag;
  }
  const metrics = listByKind(docRootPath, "metric");
  if (metrics.length === 0) {
    console.error("No metrics found. Create one with: pet new metric");
    return null;
  }
  return select({ message: "Target metric", choices: metrics });
}

async function resolveProblemHypothesisId(
  flag: string | undefined,
  docRootPath: string,
): Promise<string | null> {
  if (flag) {
    return flag;
  }
  const items = listByKind(docRootPath, "hypothesis");
  if (items.length === 0) {
    console.error("No hypotheses found. Create one with: pet new hypothesis");
    return null;
  }
  return select({ message: "Problem hypothesis", choices: items });
}

async function resolveFeatureId(
  flag: string | undefined,
  docRootPath: string,
): Promise<string | null> {
  if (flag) {
    return flag;
  }
  const items = listByKind(docRootPath, "feature");
  if (items.length === 0) {
    console.error("No features found. Create one with: pet new feature");
    return null;
  }
  return select({ message: "Feature", choices: items });
}

async function resolveFeatureIds(
  flag: string | undefined,
  docRootPath: string,
): Promise<string[] | null> {
  if (flag) {
    return flag.split(",").map((s) => s.trim());
  }
  const featureId = await resolveFeatureId(undefined, docRootPath);
  return featureId ? [featureId] : null;
}

function listByKind(docRootPath: string, kind: ArtifactKind): { name: string; value: string }[] {
  const scan = scanArtifacts(docRootPath);
  if (scan.isErr()) {
    return [];
  }
  return scan.value
    .filter((a) => a.kind === kind)
    .map((a) => ({
      name: a.frontmatter.id,
      value: a.frontmatter.id,
    }));
}
