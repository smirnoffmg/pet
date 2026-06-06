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

function metricBody(title: string): string {
  return `# ${title}

## Context

## Decision

## Consequences
`;
}

function hypothesisBody(title: string): string {
  return `# ${title}

## Context

## Decision

## Evidence

## How we measure

## Consequences
`;
}

function solutionHypothesisBody(title: string): string {
  return `# ${title}

## Context

## Decision

## Experiments

## Success criteria

## Consequences
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

function releaseBody(title: string): string {
  return `# ${title}

## Context

## Decision

## Consequences
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
