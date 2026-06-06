export type ValidationIssue = {
  filePath?: string;
  artifactId?: string;
  code: "schema" | "filename" | "fk" | "immutability" | "mcp";
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export function emptyReport(): ValidationReport {
  return { ok: true, issues: [] };
}

export function mergeReports(...reports: ValidationReport[]): ValidationReport {
  const issues = reports.flatMap((r) => r.issues);
  return { ok: issues.length === 0, issues };
}

export function issue(
  code: ValidationIssue["code"],
  message: string,
  meta?: { filePath?: string; artifactId?: string },
): ValidationIssue {
  return { code, message, ...meta };
}
