import type { WordChangeConfidence } from "./emphasis";
import {
  wordEmphasisSimilarityTokenValues,
  wordEmphasisTokenWeight,
  wordEmphasisTokens,
  type WordEmphasisToken,
} from "./tokens";
import type { AddedDiffLine, RemovedDiffLine } from "../parse";
import { escapeControlChars } from "../../shared/terminal-text";

export type IndexedChangedLine<T extends AddedDiffLine | RemovedDiffLine> = {
  index: number;
  line: T;
  normalizedContent?: string;
  tokens?: WordEmphasisToken[];
  similarityTokenValues?: string[];
  similarityFeatureValues?: string[];
};

export function indexedChangedLine<T extends AddedDiffLine | RemovedDiffLine>(
  index: number,
  line: T,
): IndexedChangedLine<T> {
  return { index, line };
}

export function normalizedChangedContent(
  line: IndexedChangedLine<AddedDiffLine | RemovedDiffLine>,
): string {
  // Compute ranges against the same normalized text that Shiki/fallback rendering displays.
  // Otherwise tabs or escaped control chars shift the emphasis range by multiple cells.
  return (line.normalizedContent ??= normalizeDiffContent(line.line.content));
}

export function changedLineTokens(
  line: IndexedChangedLine<AddedDiffLine | RemovedDiffLine>,
): WordEmphasisToken[] {
  return (line.tokens ??= wordEmphasisTokens(normalizedChangedContent(line)));
}

function changedLineSimilarityTokenValues(
  line: IndexedChangedLine<AddedDiffLine | RemovedDiffLine>,
): string[] {
  return (line.similarityTokenValues ??= wordEmphasisSimilarityTokenValues(
    changedLineTokens(line),
  ));
}

function changedLineSimilarityFeatureValues(
  line: IndexedChangedLine<AddedDiffLine | RemovedDiffLine>,
): string[] {
  return (line.similarityFeatureValues ??= similarityFeatures(
    changedLineSimilarityTokenValues(line),
  ));
}

export type ChangedLinePair = {
  removedIndex: number;
  addedIndex: number;
  confidence: WordChangeConfidence;
};

type ChangedLinePairCandidate = {
  removedPosition: number;
  addedPosition: number;
  score: number;
};

export function matchChangedLines(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePair[] {
  if (removed.length === 0 || added.length === 0) return [];
  if (removed.length * added.length > MAX_CHANGED_LINE_PAIR_CELLS)
    return matchChangedLinesByPosition(removed, added);
  const similarityDocuments = changedLineSimilarityDocuments(removed, added);
  const tokenWeight = similarityTokenWeight(similarityDocuments);
  const { removedFeatures, addedFeatures } = similarityDocuments;
  const scores = removedFeatures.map((beforeTokens) =>
    addedFeatures.map((afterTokens) => tokenSimilarity(beforeTokens, afterTokens, tokenWeight)),
  );
  const dp = Array.from({ length: removed.length + 1 }, () =>
    Array.from({ length: added.length + 1 }, () => 0),
  );

  for (let i = 1; i <= removed.length; i++) {
    for (let j = 1; j <= added.length; j++) {
      const score = scores[i - 1]?.[j - 1] ?? 0;
      const pair =
        score >= MIN_CHANGED_LINE_PAIR_SCORE
          ? dp[i - 1]![j - 1]! + score + 0.01
          : Number.NEGATIVE_INFINITY;
      dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, pair);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = removed.length;
  let j = added.length;
  while (i > 0 && j > 0) {
    const score = scores[i - 1]?.[j - 1] ?? 0;
    const pair =
      score >= MIN_CHANGED_LINE_PAIR_SCORE
        ? dp[i - 1]![j - 1]! + score + 0.01
        : Number.NEGATIVE_INFINITY;
    if (Math.abs(dp[i]![j]! - pair) < 1e-9) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  const similarPairs = pairs.reverse();
  if (similarPairs.length === 0 && removed.length === 1 && added.length === 1)
    return [
      {
        removedIndex: removed[0]!.index,
        addedIndex: added[0]!.index,
        confidence: "medium",
      },
    ];
  const positions = changedLinePositions(removed, added);
  const confidentPairs = confidentChangedLinePairs(
    positions,
    scores,
    addPositionalFallbackPairs(removed, added, scores, similarPairs),
  );
  return addHighConfidenceCrossingPairs(removed, added, scores, positions, confidentPairs);
}

const MIN_CHANGED_LINE_PAIR_SCORE = 0.45;
const MIN_POSITIONAL_FALLBACK_PAIR_SCORE = 0.28;
const CHANGED_LINE_PAIR_AMBIGUITY_MARGIN = 0.06;
const CHANGED_LINE_PAIR_AMBIGUITY_RATIO = 0.92;
const MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE = 0.72;
const HIGH_CONFIDENCE_CROSSING_PAIR_MARGIN = 0.12;
const HIGH_CONFIDENCE_CROSSING_PAIR_RATIO = 0.85;
const MAX_CHANGED_LINE_PAIR_CELLS = 1024;
const MAX_POSITIONAL_FALLBACK_AMBIGUITY_CELLS = 10_000;
const MAX_LINE_TOKEN_SIMILARITY_CELLS = 16_384;

function matchChangedLinesByPosition(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePair[] {
  const pairs: ChangedLinePair[] = [];
  const similarityDocuments = changedLineSimilarityDocuments(removed, added);
  const tokenWeight = similarityTokenWeight(similarityDocuments);
  const canCheckAmbiguity =
    removed.length * added.length <= MAX_POSITIONAL_FALLBACK_AMBIGUITY_CELLS;
  const scoreCache = new Map<string, number>();
  const scoreAt = (removedPosition: number, addedPosition: number): number => {
    const key = `${removedPosition}:${addedPosition}`;
    const cached = scoreCache.get(key);
    if (cached !== undefined) return cached;
    const score = fallbackLineSimilarity(
      removed[removedPosition]!,
      added[addedPosition]!,
      tokenWeight,
    );
    scoreCache.set(key, score);
    return score;
  };

  for (let index = 0; index < Math.min(removed.length, added.length); index++) {
    const score = scoreAt(index, index);
    if (score < MIN_POSITIONAL_FALLBACK_PAIR_SCORE) continue;
    if (hasUniqueSharedSimilarityFeature(removed[index]!, added[index]!, similarityDocuments)) {
      pairs.push({
        removedIndex: removed[index]!.index,
        addedIndex: added[index]!.index,
        confidence: linePairConfidence(score, 0),
      });
      continue;
    }
    if (!canCheckAmbiguity) continue;

    const competingScore = competingChangedLineScoreByPosition(
      removed.length,
      added.length,
      index,
      index,
      scoreAt,
    );
    if (isAmbiguousChangedLinePairScore(score, competingScore)) continue;
    pairs.push({
      removedIndex: removed[index]!.index,
      addedIndex: added[index]!.index,
      confidence: linePairConfidence(score, competingScore),
    });
  }
  return pairs;
}

function competingChangedLineScoreByPosition(
  removedLength: number,
  addedLength: number,
  removedPosition: number,
  addedPosition: number,
  scoreAt: (removedPosition: number, addedPosition: number) => number,
): number {
  let competingScore = 0;
  for (
    let candidateAddedPosition = 0;
    candidateAddedPosition < addedLength;
    candidateAddedPosition++
  ) {
    if (candidateAddedPosition === addedPosition) continue;
    competingScore = Math.max(competingScore, scoreAt(removedPosition, candidateAddedPosition));
  }
  for (
    let candidateRemovedPosition = 0;
    candidateRemovedPosition < removedLength;
    candidateRemovedPosition++
  ) {
    if (candidateRemovedPosition === removedPosition) continue;
    competingScore = Math.max(competingScore, scoreAt(candidateRemovedPosition, addedPosition));
  }
  return competingScore;
}

type ChangedLineSimilarityDocuments = {
  removedFeatures: string[][];
  addedFeatures: string[][];
  documentCounts: Map<string, number>;
};

function changedLineSimilarityDocuments(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLineSimilarityDocuments {
  const removedFeatures = removed.map(changedLineSimilarityFeatureValues);
  const addedFeatures = added.map(changedLineSimilarityFeatureValues);
  const documentCounts = new Map<string, number>();
  for (const features of [...removedFeatures, ...addedFeatures]) {
    for (const feature of new Set(features))
      documentCounts.set(feature, (documentCounts.get(feature) ?? 0) + 1);
  }
  return { removedFeatures, addedFeatures, documentCounts };
}

function hasUniqueSharedSimilarityFeature(
  removed: IndexedChangedLine<RemovedDiffLine>,
  added: IndexedChangedLine<AddedDiffLine>,
  documents: ChangedLineSimilarityDocuments,
): boolean {
  const addedFeatures = new Set(changedLineSimilarityFeatureValues(added));
  for (const feature of new Set(changedLineSimilarityFeatureValues(removed))) {
    if (!addedFeatures.has(feature)) continue;
    if (documents.documentCounts.get(feature) === 2 && tokenWeight(feature) >= 1) return true;
  }
  return false;
}

type SimilarityTokenWeight = (token: string) => number;

const SIMILARITY_BIGRAM_PREFIX = "\u0000PI_SIM_BIGRAM\u0000";

function similarityFeatures(tokens: string[]): string[] {
  const features = [...tokens];
  appendSimilarityShingles(
    features,
    tokens.filter(isSimilarityShingleToken),
    2,
    SIMILARITY_BIGRAM_PREFIX,
  );
  return features;
}

function appendSimilarityShingles(
  features: string[],
  tokens: string[],
  size: number,
  prefix: string,
): void {
  for (let index = 0; index + size <= tokens.length; index++)
    features.push(`${prefix}${tokens.slice(index, index + size).join("\u0000")}`);
}

function isSimilarityShingleToken(token: string): boolean {
  return wordEmphasisTokenWeight(token) >= 1;
}

function similarityTokenWeight(documents: ChangedLineSimilarityDocuments): SimilarityTokenWeight {
  const weights = new Map<string, number>();
  const lineCount = documents.removedFeatures.length + documents.addedFeatures.length;
  return (token) => {
    const cached = weights.get(token);
    if (cached !== undefined) return cached;
    const documentCount = documents.documentCounts.get(token) ?? lineCount;
    const rarity = Math.min(3, 1 + Math.log((lineCount + 1) / (documentCount + 1)));
    const weight = tokenWeight(token) * rarity;
    weights.set(token, weight);
    return weight;
  };
}

type ChangedLinePositions = {
  removed: Map<number, number>;
  added: Map<number, number>;
};

function changedLinePositions(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePositions {
  return {
    removed: new Map(removed.map((line, index) => [line.index, index])),
    added: new Map(added.map((line, index) => [line.index, index])),
  };
}

function confidentChangedLinePairs(
  positions: ChangedLinePositions,
  scores: number[][],
  pairs: Array<[number, number]>,
): ChangedLinePair[] {
  const confidentPairs: ChangedLinePair[] = [];
  for (const [removedIndex, addedIndex] of pairs) {
    const removedPosition = positions.removed.get(removedIndex);
    const addedPosition = positions.added.get(addedIndex);
    if (removedPosition === undefined || addedPosition === undefined) continue;
    const score = scores[removedPosition]?.[addedPosition] ?? 0;
    const competingScore = competingChangedLineScore(
      scores,
      removedPosition,
      addedPosition,
      new Set(),
      new Set(),
    );
    if (isAmbiguousChangedLinePairScore(score, competingScore)) continue;
    confidentPairs.push({
      removedIndex,
      addedIndex,
      confidence: linePairConfidence(score, competingScore),
    });
  }
  return confidentPairs;
}

function competingChangedLineScore(
  scores: number[][],
  removedPosition: number,
  addedPosition: number,
  usedRemoved: Set<number>,
  usedAdded: Set<number>,
): number {
  let competingScore = 0;
  const row = scores[removedPosition] ?? [];
  for (
    let candidateAddedPosition = 0;
    candidateAddedPosition < row.length;
    candidateAddedPosition++
  ) {
    if (candidateAddedPosition === addedPosition || usedAdded.has(candidateAddedPosition)) continue;
    competingScore = Math.max(competingScore, row[candidateAddedPosition] ?? 0);
  }
  for (
    let candidateRemovedPosition = 0;
    candidateRemovedPosition < scores.length;
    candidateRemovedPosition++
  ) {
    if (candidateRemovedPosition === removedPosition || usedRemoved.has(candidateRemovedPosition))
      continue;
    competingScore = Math.max(
      competingScore,
      scores[candidateRemovedPosition]?.[addedPosition] ?? 0,
    );
  }
  return competingScore;
}

function isAmbiguousChangedLinePairScore(score: number, competingScore: number): boolean {
  return (
    competingScore >= MIN_POSITIONAL_FALLBACK_PAIR_SCORE &&
    (score - competingScore <= CHANGED_LINE_PAIR_AMBIGUITY_MARGIN ||
      competingScore >= score * CHANGED_LINE_PAIR_AMBIGUITY_RATIO)
  );
}

function linePairConfidence(score: number, competingScore: number): WordChangeConfidence {
  if (
    score >= MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE &&
    score - competingScore >= HIGH_CONFIDENCE_CROSSING_PAIR_MARGIN &&
    competingScore <= score * HIGH_CONFIDENCE_CROSSING_PAIR_RATIO
  )
    return "high";
  return "medium";
}

function addHighConfidenceCrossingPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  positions: ChangedLinePositions,
  pairs: ChangedLinePair[],
): ChangedLinePair[] {
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  for (const pair of pairs) {
    const removedPosition = positions.removed.get(pair.removedIndex);
    const addedPosition = positions.added.get(pair.addedIndex);
    if (removedPosition !== undefined) usedRemoved.add(removedPosition);
    if (addedPosition !== undefined) usedAdded.add(addedPosition);
  }

  const candidates: ChangedLinePairCandidate[] = [];
  for (let removedPosition = 0; removedPosition < removed.length; removedPosition++) {
    if (usedRemoved.has(removedPosition)) continue;
    for (let addedPosition = 0; addedPosition < added.length; addedPosition++) {
      if (usedAdded.has(addedPosition)) continue;
      const score = scores[removedPosition]?.[addedPosition] ?? 0;
      if (score >= MIN_HIGH_CONFIDENCE_CROSSING_PAIR_SCORE)
        candidates.push({ removedPosition, addedPosition, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const out = [...pairs];
  for (const candidate of candidates) {
    if (usedRemoved.has(candidate.removedPosition) || usedAdded.has(candidate.addedPosition))
      continue;
    if (!isHighConfidenceCrossingPair(scores, candidate, usedRemoved, usedAdded)) continue;
    usedRemoved.add(candidate.removedPosition);
    usedAdded.add(candidate.addedPosition);
    out.push({
      removedIndex: removed[candidate.removedPosition]!.index,
      addedIndex: added[candidate.addedPosition]!.index,
      confidence: "high",
    });
  }

  return out.sort(
    (a, b) =>
      (positions.removed.get(a.removedIndex) ?? 0) - (positions.removed.get(b.removedIndex) ?? 0),
  );
}

function isHighConfidenceCrossingPair(
  scores: number[][],
  candidate: ChangedLinePairCandidate,
  usedRemoved: Set<number>,
  usedAdded: Set<number>,
): boolean {
  return (
    linePairConfidence(
      candidate.score,
      competingChangedLineScore(
        scores,
        candidate.removedPosition,
        candidate.addedPosition,
        usedRemoved,
        usedAdded,
      ),
    ) === "high"
  );
}

function addPositionalFallbackPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  similarPairs: Array<[number, number]>,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let removedCursor = 0;
  let addedCursor = 0;
  for (const [removedPosition, addedPosition] of similarPairs) {
    pairs.push(
      ...positionPairs(
        removed,
        added,
        scores,
        removedCursor,
        removedPosition,
        addedCursor,
        addedPosition,
      ),
    );
    pairs.push([removed[removedPosition]!.index, added[addedPosition]!.index]);
    removedCursor = removedPosition + 1;
    addedCursor = addedPosition + 1;
  }
  pairs.push(
    ...positionPairs(
      removed,
      added,
      scores,
      removedCursor,
      removed.length,
      addedCursor,
      added.length,
    ),
  );
  return pairs;
}

function positionPairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  removedStart: number,
  removedEnd: number,
  addedStart: number,
  addedEnd: number,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const count = Math.min(removedEnd - removedStart, addedEnd - addedStart);
  for (let offset = 0; offset < count; offset++) {
    const removedPosition = removedStart + offset;
    const addedPosition = addedStart + offset;
    const score = scores[removedPosition]?.[addedPosition] ?? 0;
    if (score < MIN_POSITIONAL_FALLBACK_PAIR_SCORE) continue;
    pairs.push([removed[removedPosition]!.index, added[addedPosition]!.index]);
  }
  return pairs;
}

function fallbackLineSimilarity(
  removed: IndexedChangedLine<RemovedDiffLine>,
  added: IndexedChangedLine<AddedDiffLine>,
  weight: SimilarityTokenWeight,
): number {
  return unorderedTokenSimilarity(
    changedLineSimilarityFeatureValues(removed),
    changedLineSimilarityFeatureValues(added),
    weight,
  );
}

function tokenSimilarity(
  beforeTokens: string[],
  afterTokens: string[],
  weight: SimilarityTokenWeight = tokenWeight,
): number {
  if (beforeTokens.length === 0 || afterTokens.length === 0)
    return beforeTokens.length === afterTokens.length ? 1 : 0;
  const bagSimilarity = unorderedTokenSimilarity(beforeTokens, afterTokens, weight);
  const orderedSimilarity = orderedTokenSimilarity(beforeTokens, afterTokens, weight);
  if (orderedSimilarity === undefined) return bagSimilarity;
  return Math.max(
    orderedSimilarity,
    bagSimilarity * 0.8,
    orderedSimilarity * 0.75 + bagSimilarity * 0.25,
  );
}

function unorderedTokenSimilarity(
  beforeTokens: string[],
  afterTokens: string[],
  weight: SimilarityTokenWeight,
): number {
  const beforeWeight = tokenListWeight(beforeTokens, weight);
  const afterWeight = tokenListWeight(afterTokens, weight);
  const remaining = new Map<string, number>();
  for (const token of beforeTokens) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let sharedWeight = 0;
  for (const token of afterTokens) {
    const count = remaining.get(token) ?? 0;
    if (count === 0) continue;
    sharedWeight += weight(token);
    if (count === 1) remaining.delete(token);
    else remaining.set(token, count - 1);
  }
  return (2 * sharedWeight) / (beforeWeight + afterWeight);
}

function orderedTokenSimilarity(
  beforeTokens: string[],
  afterTokens: string[],
  weight: SimilarityTokenWeight,
): number | undefined {
  if (beforeTokens.length * afterTokens.length > MAX_LINE_TOKEN_SIMILARITY_CELLS) return undefined;
  const beforeWeight = tokenListWeight(beforeTokens, weight);
  const afterWeight = tokenListWeight(afterTokens, weight);
  let next = new Float64Array(afterTokens.length + 1);
  let current = new Float64Array(afterTokens.length + 1);

  for (let i = beforeTokens.length - 1; i >= 0; i--) {
    current[afterTokens.length] = 0;
    for (let j = afterTokens.length - 1; j >= 0; j--) {
      const match =
        beforeTokens[i] === afterTokens[j]
          ? next[j + 1]! + weight(beforeTokens[i]!)
          : Number.NEGATIVE_INFINITY;
      current[j] = Math.max(match, next[j]!, current[j + 1]!);
    }
    [next, current] = [current, next];
  }

  return (2 * next[0]!) / (beforeWeight + afterWeight);
}

function tokenListWeight(tokens: string[], weight: SimilarityTokenWeight): number {
  return tokens.reduce((total, token) => total + weight(token), 0);
}

function tokenWeight(token: string): number {
  if (token.startsWith(SIMILARITY_BIGRAM_PREFIX)) return 1.15;
  return wordEmphasisTokenWeight(token);
}

function normalizeDiffContent(content: string): string {
  return escapeControlChars(content.replace(/\t/g, "   "));
}
