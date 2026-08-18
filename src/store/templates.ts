import type { ArtifactKind } from "@/schemas/ids.js";

export function bodyTemplateForKind(kind: ArtifactKind, title: string): string {
  switch (kind) {
    case "metric":
      return metricBody(title);
    case "hypothesis":
      return hypothesisBody(title);
    case "solution_hypothesis":
      return solutionHypothesisBody(title);
    case "feature":
      return featureBody(title);
    case "release":
      return releaseBody(title);
    case "task":
      return taskBody(title);
    case "qa_plan":
      return qaPlanBody(title);
  }
}

// Section sets mirror who fills them: a template must not scaffold a section that
// no pipeline role (or the human at creation time) is responsible for filling.
function metricBody(title: string): string {
  return `# ${title}

## Decision

## How we measure
`;
}

function hypothesisBody(title: string): string {
  return `# ${title}

## Context

## Evidence
`;
}

function solutionHypothesisBody(title: string): string {
  return `# ${title}

## Decision

## Success criteria
`;
}

function featureBody(title: string): string {
  return `# ${title}

## Context

## Decision

## Acceptance criteria

## Consequences
`;
}

// Title-only: DevOps appends Deployment Checklist and Rollback Plan; scaffold
// detection (featureBodyIsScaffold) treats a title-only body as unenriched.
function releaseBody(title: string): string {
  return `# ${title}
`;
}

function taskBody(title: string): string {
  return `# ${title}

## Description

## Notes
`;
}

function qaPlanBody(title: string): string {
  return `# ${title}

## Test Plan

## Acceptance Criteria Verification

## Test Cases

## Risk Areas
`;
}

export function adrTemplate(n: number, title: string, date: string): string {
  return `# ${n}. ${title}

Date: ${date}

## Status

Proposed

## Context

## Decision

## Consequences
`;
}
