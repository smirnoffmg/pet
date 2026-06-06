import type { Result } from "neverthrow";
import type { ArtifactId, ArtifactKind } from "@/schemas/ids.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { ArtifactIndex } from "@/store/scan.js";

export type RetrievalQuery = {
  readonly seedIds?: readonly ArtifactId[];
  readonly kinds?: readonly ArtifactKind[];
  readonly maxHops?: number;
  readonly limit?: number;
  readonly excludeSuperseded?: boolean;
};

export type RankedArtifact = {
  readonly artifact: ParsedArtifact;
  readonly score: number;
  readonly hops: number;
};

export type RetrievalResult = {
  readonly items: readonly RankedArtifact[];
};

export type RetrievalError = {
  readonly name: "RetrievalError";
  readonly message: string;
};

export type Retriever = (
  index: ArtifactIndex,
  query: RetrievalQuery,
) => Result<RetrievalResult, RetrievalError>;
