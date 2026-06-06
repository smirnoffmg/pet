import { err, ok, type Result } from "neverthrow";
import { scanArtifacts, buildIndex } from "@/store/scan.js";
import { validateFilenames } from "./filename.js";
import { validateForeignKeys } from "./fk.js";
import { validateImmutability } from "./immutability.js";
import { mergeReports, issue, emptyReport, type ValidationReport } from "./report.js";
import { validateMcpConfig } from "@/llm/mcp-tools.js";

export function validateRepo(docRoot: string, repoRoot: string): Result<void, ValidationReport> {
  const scanResult = scanArtifacts(docRoot);
  if (scanResult.isErr()) {
    const report: ValidationReport = {
      ok: false,
      issues: [issue("schema", scanResult.error.message)],
    };
    return err(report);
  }

  const artifacts = scanResult.value;
  const index = buildIndex(artifacts);

  const mcpErrors = validateMcpConfig(repoRoot);
  const mcpReport: ValidationReport =
    mcpErrors.length === 0
      ? emptyReport()
      : { ok: false, issues: mcpErrors.map((m) => issue("mcp", m)) };

  const report = mergeReports(
    validateFilenames(artifacts),
    validateForeignKeys(artifacts, index),
    validateImmutability(repoRoot, artifacts),
    mcpReport,
  );

  if (report.ok) {
    return ok(undefined);
  }
  return err(report);
}

export function formatReport(report: ValidationReport): string {
  if (report.ok) {
    return "Validation passed.";
  }
  return report.issues
    .map((i) => {
      const loc = i.filePath ?? i.artifactId ?? "unknown";
      return `[${i.code}] ${loc}: ${i.message}`;
    })
    .join("\n");
}
