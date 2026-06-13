import type { ArtifactId } from "@/schemas/ids.js";
import type { ArtifactIndex } from "@/store/scan.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";

export type AdjacencyMap = ReadonlyMap<ArtifactId, ReadonlySet<ArtifactId>>;

function link(adj: Map<ArtifactId, Set<ArtifactId>>, a: ArtifactId, b: ArtifactId): void {
  let aSet = adj.get(a);
  if (!aSet) {
    aSet = new Set();
    adj.set(a, aSet);
  }
  let bSet = adj.get(b);
  if (!bSet) {
    bSet = new Set();
    adj.set(b, bSet);
  }
  aSet.add(b);
  bSet.add(a);
}

export function buildAdjacency(index: ArtifactIndex): AdjacencyMap {
  const adj = new Map<ArtifactId, Set<ArtifactId>>();

  for (const artifact of index.values()) {
    const id = artifact.frontmatter.id as ArtifactId;
    const fm = artifact.frontmatter;

    if (artifact.kind === "metric") {
      const m = fm as TargetMetricFrontmatter;
      link(adj, id, m.problem_hypothesis_id as ArtifactId);
      if (m.supersedes) link(adj, id, m.supersedes as ArtifactId);
      if (m.superseded_by) link(adj, id, m.superseded_by as ArtifactId);
    } else if (artifact.kind === "solution_hypothesis") {
      const sh = fm as SolutionHypothesisFrontmatter;
      for (const metricId of sh.metric_ids) link(adj, id, metricId as ArtifactId);
      if (sh.supersedes) link(adj, id, sh.supersedes as ArtifactId);
      if (sh.superseded_by) link(adj, id, sh.superseded_by as ArtifactId);
    } else if (artifact.kind === "feature") {
      const f = fm as FeatureFrontmatter;
      if (f.solution_hypothesis_id) link(adj, id, f.solution_hypothesis_id as ArtifactId);
      if (f.supersedes) link(adj, id, f.supersedes as ArtifactId);
      if (f.superseded_by) link(adj, id, f.superseded_by as ArtifactId);
    } else if (artifact.kind === "task") {
      const t = fm as DevTaskFrontmatter;
      link(adj, id, t.feature_id as ArtifactId);
    } else if (artifact.kind === "release") {
      const r = fm as ReleaseFrontmatter;
      for (const fid of r.feature_ids) {
        link(adj, id, fid as ArtifactId);
      }
      if (r.supersedes) link(adj, id, r.supersedes as ArtifactId);
      if (r.superseded_by) link(adj, id, r.superseded_by as ArtifactId);
    }
  }

  return adj;
}

export function bfsNeighbors(
  adj: AdjacencyMap,
  seeds: ReadonlySet<ArtifactId>,
  maxHops: number,
): Map<ArtifactId, number> {
  const visited = new Map<ArtifactId, number>();
  const queue: Array<{ id: ArtifactId; hops: number }> = [];

  for (const seed of seeds) {
    visited.set(seed, 0);
    queue.push({ id: seed, hops: 0 });
  }

  let i = 0;
  while (i < queue.length) {
    const item = queue[i];
    i++;
    if (!item) continue;
    const { id, hops } = item;
    if (hops >= maxHops) continue;
    const neighbors = adj.get(id) ?? new Set<ArtifactId>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, hops + 1);
        queue.push({ id: neighbor, hops: hops + 1 });
      }
    }
  }

  return visited;
}
