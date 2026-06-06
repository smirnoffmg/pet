import { ok, err } from "neverthrow";
import type { ArtifactId } from "@/schemas/ids.js";
import { buildAdjacency, bfsNeighbors } from "./graph.js";
import type { RankedArtifact, RetrievalError, Retriever } from "./types.js";

function scoreForHops(hops: number): number {
  if (hops === 0) return 1.0;
  if (hops === 1) return 0.6;
  if (hops === 2) return 0.3;
  return 0.1;
}

export const retrieve: Retriever = (index, query) => {
  const { seedIds, kinds, maxHops = 2, limit, excludeSuperseded = true } = query;

  try {
    let hopMap: Map<ArtifactId, number>;

    if (seedIds && seedIds.length > 0) {
      const adj = buildAdjacency(index);
      const seedSet = new Set<ArtifactId>(seedIds);
      hopMap = bfsNeighbors(adj, seedSet, maxHops);
    } else {
      hopMap = new Map<ArtifactId, number>();
      for (const id of index.keys()) {
        hopMap.set(id, 0);
      }
    }

    const items: RankedArtifact[] = [];

    for (const [id, hops] of hopMap) {
      const artifact = index.get(id);
      if (!artifact) continue;
      if (kinds && kinds.length > 0 && !kinds.includes(artifact.kind)) continue;
      if (excludeSuperseded && artifact.frontmatter.status === "superseded") continue;
      items.push({ artifact, score: scoreForHops(hops), hops });
    }

    items.sort((a, b) => b.score - a.score || a.hops - b.hops);

    const limited = limit != null ? items.slice(0, limit) : items;
    return ok({ items: limited });
  } catch (e) {
    const error: RetrievalError = {
      name: "RetrievalError",
      message: e instanceof Error ? e.message : String(e),
    };
    return err(error);
  }
};
