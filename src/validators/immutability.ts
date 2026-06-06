import { execSync } from "node:child_process";
import fs from "node:fs";
import matter from "gray-matter";
import path from "node:path";
import { isDecisionKind } from "@/schemas/index.js";
import type { ParsedArtifact } from "@/store/parse.js";
import { featureBodyIsScaffold } from "@/controllers/discovery-helpers.js";
import { issue, type ValidationReport } from "./report.js";

const ALLOWED_SUPERSESSION_KEYS = new Set(["superseded_by", "status"]);

/** Workflow fields on accepted features (Architect gate), not decision content. */
const ALLOWED_FEATURE_WORKFLOW_KEYS = new Set(["architectural_review_status"]);

function allowedMutableKeys(artifact: ParsedArtifact): Set<string> {
  const keys = new Set(ALLOWED_SUPERSESSION_KEYS);
  if (artifact.kind === "feature") {
    for (const k of ALLOWED_FEATURE_WORKFLOW_KEYS) {
      keys.add(k);
    }
  }
  return keys;
}

export function validateImmutability(
  repoRoot: string,
  artifacts: ParsedArtifact[],
): ValidationReport {
  const issues = [];
  let hasGitHistory = false;

  for (const artifact of artifacts) {
    if (!isDecisionKind(artifact.kind)) {
      continue;
    }
    const relativePath = path.relative(repoRoot, artifact.filePath).replaceAll("\\", "/");
    if (readCommittedFile(repoRoot, relativePath) !== null) {
      hasGitHistory = true;
      break;
    }
  }

  if (!hasGitHistory) {
    process.stderr.write("Warning: no git history found — immutability checks skipped\n");
  }

  for (const artifact of artifacts) {
    if (!isDecisionKind(artifact.kind)) {
      continue;
    }

    const status = artifact.frontmatter.status;
    const relativePath = path.relative(repoRoot, artifact.filePath).replaceAll("\\", "/");

    const committedRaw = readCommittedFile(repoRoot, relativePath);
    if (committedRaw === null) {
      continue;
    }

    const currentRaw = fs.readFileSync(artifact.filePath, "utf8");
    if (committedRaw === currentRaw) {
      continue;
    }

    const committed = matter(committedRaw);
    const current = matter(currentRaw);
    const committedFm = committed.data as Record<string, unknown>;
    const currentFm = current.data as Record<string, unknown>;
    const committedStatus = committedFm["status"];

    if (committedStatus === "superseded" || committedStatus === "rejected") {
      issues.push(
        issue("immutability", "Superseded and rejected artifacts must not be edited", {
          artifactId: artifact.frontmatter.id,
          filePath: artifact.filePath,
        }),
      );
      continue;
    }

    if (committedStatus !== "accepted") {
      continue;
    }

    if (committed.content !== current.content) {
      const completingScaffold =
        artifact.kind === "feature" &&
        featureBodyIsScaffold(committed.content) &&
        !featureBodyIsScaffold(current.content);
      if (!completingScaffold) {
        issues.push(
          issue(
            "immutability",
            "Body of accepted decision artifact cannot be changed; use supersession",
            { artifactId: artifact.frontmatter.id, filePath: artifact.filePath },
          ),
        );
      }
    }

    const mutableKeys = allowedMutableKeys(artifact);
    const allKeys = new Set([...Object.keys(committedFm), ...Object.keys(currentFm)]);

    for (const key of allKeys) {
      if (JSON.stringify(committedFm[key]) === JSON.stringify(currentFm[key])) {
        continue;
      }
      if (mutableKeys.has(key)) {
        continue;
      }
      issues.push(
        issue("immutability", `Frontmatter field "${key}" cannot change on accepted artifact`, {
          artifactId: artifact.frontmatter.id,
          filePath: artifact.filePath,
        }),
      );
    }

    const validSupersession =
      currentFm["superseded_by"] !== undefined && currentFm["status"] === "superseded";
    if (status === "superseded" && !validSupersession) {
      issues.push(
        issue("immutability", "Supersession requires superseded_by and status: superseded", {
          artifactId: artifact.frontmatter.id,
          filePath: artifact.filePath,
        }),
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

function readCommittedFile(repoRoot: string, relativePath: string): string | null {
  try {
    return execSync(`git show HEAD:${relativePath}`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}
