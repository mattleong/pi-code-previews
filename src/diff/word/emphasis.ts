import { codePreviewSettings } from "../../settings/index";

export type WordChangeRanges = {
  removed: Array<[number, number]>;
  added: Array<[number, number]>;
};

export type WordChangeConfidence = "high" | "medium" | "low";

export type ConfidentWordChangeRanges = WordChangeRanges & {
  confidence: WordChangeConfidence;
};

export type WordEmphasisToken = {
  value: string;
  start: number;
  end: number;
};

export function shouldEmphasizeChangedPair(
  ranges: ConfidentWordChangeRanges,
  lineConfidence: WordChangeConfidence,
): boolean {
  if (ranges.removed.length === 0 && ranges.added.length === 0) return false;
  if (lineConfidence === "low") return false;
  if (ranges.confidence === "low" && lineConfidence !== "high") return false;
  return true;
}

export function wordEmphasisTokens(text: string): WordEmphasisToken[] {
  return tokenizeForWordEmphasis(text);
}

export function wordEmphasisTokenValues(text: string): string[] {
  return wordEmphasisTokens(text).map((token) => token.value);
}

export function changedRanges(before: string, after: string): WordChangeRanges {
  return stripWordChangeConfidence(changedRangesWithConfidence(before, after));
}

export function changedRangesWithConfidence(
  before: string,
  after: string,
): ConfidentWordChangeRanges {
  return changedRangesForTokensWithConfidence(
    before,
    after,
    wordEmphasisTokens(before),
    wordEmphasisTokens(after),
  );
}

export function changedRangesForTokens(
  before: string,
  after: string,
  beforeTokens: WordEmphasisToken[],
  afterTokens: WordEmphasisToken[],
): WordChangeRanges {
  return stripWordChangeConfidence(
    changedRangesForTokensWithConfidence(before, after, beforeTokens, afterTokens),
  );
}

export function changedRangesForTokensWithConfidence(
  before: string,
  after: string,
  beforeTokens: WordEmphasisToken[],
  afterTokens: WordEmphasisToken[],
): ConfidentWordChangeRanges {
  const removedTokens = new Set<number>();
  const addedTokens = new Set<number>();
  const alignmentConfidence = collectChangedTokenIndexes(
    beforeTokens,
    0,
    beforeTokens.length,
    afterTokens,
    0,
    afterTokens.length,
    {
      removed: removedTokens,
      added: addedTokens,
    },
  );
  const ranges = refinedRangesForChangedTokens(
    beforeTokens,
    afterTokens,
    removedTokens,
    addedTokens,
  );
  const confidence: WordChangeConfidence = hasWordChangeRanges(ranges)
    ? alignmentConfidence
    : "low";
  if (codePreviewSettings.wordEmphasis !== "smart") return { ...ranges, confidence };

  const filtered = filterLowSignalWordEmphasis(before, after, ranges);
  return { ...filtered, confidence: hasWordChangeRanges(filtered) ? confidence : "low" };
}

function stripWordChangeConfidence(ranges: ConfidentWordChangeRanges): WordChangeRanges {
  return { removed: ranges.removed, added: ranges.added };
}

function hasWordChangeRanges(ranges: WordChangeRanges): boolean {
  return ranges.removed.length > 0 || ranges.added.length > 0;
}

const WORD_EMPHASIS_EXACT_LCS_MAX_CELLS = 262_144;

const WORD_TOKEN_PATTERN =
  /[$_\p{L}][$_\p{L}\p{N}\p{Mark}]*|\p{N}+(?:\.\p{N}+)?|===|!==|=>|==|!=|<=|>=|&&|\|\||[^\s]/gu;
const IDENTIFIER_TOKEN_PATTERN = /^[$_\p{L}][$_\p{L}\p{N}\p{Mark}]*$/u;
const NUMBER_TOKEN_PATTERN = /^\p{N}+(?:\.\p{N}+)?$/u;
const MEANINGFUL_OPERATOR_TOKEN_PATTERN =
  /^(?:===|!==|=>|==|!=|<=|>=|&&|\|\||[+\-*\/%<>=!?:~&|^]+)$/;
const DOMAIN_SEPARATOR_TOKEN_PATTERN = /^[-/:@#]$/;
const STRUCTURAL_PUNCTUATION_TOKEN_PATTERN = /^[{}()[\].,;]$/;

function tokenizeForWordEmphasis(text: string): WordEmphasisToken[] {
  const tokens: WordEmphasisToken[] = [];
  for (const match of text.matchAll(WORD_TOKEN_PATTERN)) {
    const value = match[0] ?? "";
    const start = match.index ?? 0;
    tokens.push({ value, start, end: start + value.length });
  }
  return tokens;
}

function wordTokenValues(text: string): string[] {
  return Array.from(text.matchAll(WORD_TOKEN_PATTERN), (match) => match[0] ?? "");
}

function isIdentifierToken(value: string): boolean {
  return IDENTIFIER_TOKEN_PATTERN.test(value);
}

function isNumberToken(value: string): boolean {
  return NUMBER_TOKEN_PATTERN.test(value);
}

function isMeaningfulOperatorToken(value: string): boolean {
  return MEANINGFUL_OPERATOR_TOKEN_PATTERN.test(value);
}

export function wordEmphasisTokenWeight(value: string): number {
  if (isIdentifierToken(value)) return 2;
  if (isNumberToken(value)) return 1.5;
  if (DOMAIN_SEPARATOR_TOKEN_PATTERN.test(value)) return 0.25;
  if (isMeaningfulOperatorToken(value)) return 1;
  if (STRUCTURAL_PUNCTUATION_TOKEN_PATTERN.test(value)) return 0.05;
  return 1;
}

function splitIdentifierToken(value: string, start: number): WordEmphasisToken[] {
  const parts: WordEmphasisToken[] = [];
  const partPattern =
    /[$_]+|(?:\p{Lu}\p{Mark}*)+(?=(?:\p{Lu}\p{Mark}*)(?:\p{Ll}\p{Mark}*)|\p{N}|$)|(?:\p{Lu}\p{Mark}*)?(?:\p{Ll}\p{Mark}*)+|\p{N}+|(?:\p{Lu}\p{Mark}*)+|(?:\p{L}\p{Mark}*)+/gu;
  for (const match of value.matchAll(partPattern)) {
    const part = match[0] ?? "";
    const offset = match.index ?? 0;
    parts.push({ value: part, start: start + offset, end: start + offset + part.length });
  }
  return parts.length > 0 ? parts : [{ value, start, end: start + value.length }];
}

export function wordEmphasisSimilarityTokenValues(tokens: WordEmphasisToken[]): string[] {
  const values: string[] = [];
  for (const token of tokens) {
    if (!isIdentifierToken(token.value)) {
      values.push(token.value);
      continue;
    }
    const parts = splitIdentifierToken(token.value, 0)
      .map((part) => part.value)
      .filter(isIdentifierSimilarityPart);
    if (parts.length === 0) values.push(token.value.toLowerCase());
    else values.push(...parts.map((part) => part.toLowerCase()));
  }
  return values;
}

function isIdentifierSimilarityPart(value: string): boolean {
  return !/^[$_]+$/.test(value);
}

function collectChangedTokenIndexes(
  before: WordEmphasisToken[],
  beforeStart: number,
  beforeEnd: number,
  after: WordEmphasisToken[],
  afterStart: number,
  afterEnd: number,
  changed: { removed: Set<number>; added: Set<number> },
): WordChangeConfidence {
  while (
    beforeStart < beforeEnd &&
    afterStart < afterEnd &&
    before[beforeStart]!.value === after[afterStart]!.value
  ) {
    beforeStart++;
    afterStart++;
  }

  while (
    beforeStart < beforeEnd &&
    afterStart < afterEnd &&
    before[beforeEnd - 1]!.value === after[afterEnd - 1]!.value
  ) {
    beforeEnd--;
    afterEnd--;
  }

  if (beforeStart === beforeEnd || afterStart === afterEnd) {
    markTokenRange(changed.removed, beforeStart, beforeEnd);
    markTokenRange(changed.added, afterStart, afterEnd);
    return "high";
  }

  const beforeLength = beforeEnd - beforeStart;
  const afterLength = afterEnd - afterStart;
  if (beforeLength * afterLength <= WORD_EMPHASIS_EXACT_LCS_MAX_CELLS) {
    collectChangedTokenIndexesByLcs(
      before,
      beforeStart,
      beforeEnd,
      after,
      afterStart,
      afterEnd,
      changed,
    );
    return "high";
  }

  const anchors = uniqueOrderedAnchors(before, beforeStart, beforeEnd, after, afterStart, afterEnd);
  if (anchors.length === 0) {
    markTokenRange(changed.removed, beforeStart, beforeEnd);
    markTokenRange(changed.added, afterStart, afterEnd);
    return "low";
  }

  let confidence: WordChangeConfidence = "high";
  let previousBefore = beforeStart;
  let previousAfter = afterStart;
  for (const anchor of anchors) {
    confidence = lowerWordChangeConfidence(
      confidence,
      collectChangedTokenIndexes(
        before,
        previousBefore,
        anchor.beforeIndex,
        after,
        previousAfter,
        anchor.afterIndex,
        changed,
      ),
    );
    previousBefore = anchor.beforeIndex + 1;
    previousAfter = anchor.afterIndex + 1;
  }
  confidence = lowerWordChangeConfidence(
    confidence,
    collectChangedTokenIndexes(
      before,
      previousBefore,
      beforeEnd,
      after,
      previousAfter,
      afterEnd,
      changed,
    ),
  );
  return lowerWordChangeConfidence(confidence, "medium");
}

function lowerWordChangeConfidence(
  a: WordChangeConfidence,
  b: WordChangeConfidence,
): WordChangeConfidence {
  return WORD_CHANGE_CONFIDENCE_RANK[a] <= WORD_CHANGE_CONFIDENCE_RANK[b] ? a : b;
}

const WORD_CHANGE_CONFIDENCE_RANK = {
  low: 0,
  medium: 1,
  high: 2,
} satisfies Record<WordChangeConfidence, number>;

function collectChangedTokenIndexesByLcs(
  before: WordEmphasisToken[],
  beforeStart: number,
  beforeEnd: number,
  after: WordEmphasisToken[],
  afterStart: number,
  afterEnd: number,
  changed: { removed: Set<number>; added: Set<number> },
): void {
  const beforeLength = beforeEnd - beforeStart;
  const afterLength = afterEnd - afterStart;
  const dp = Array.from({ length: beforeLength + 1 }, () => new Float64Array(afterLength + 1));

  for (let i = beforeLength - 1; i >= 0; i--) {
    for (let j = afterLength - 1; j >= 0; j--) {
      const beforeToken = before[beforeStart + i]!;
      const afterToken = after[afterStart + j]!;
      const match =
        beforeToken.value === afterToken.value
          ? dp[i + 1]![j + 1]! + wordEmphasisTokenWeight(beforeToken.value)
          : Number.NEGATIVE_INFINITY;
      dp[i]![j] = Math.max(match, dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < beforeLength && j < afterLength) {
    const beforeToken = before[beforeStart + i]!;
    const afterToken = after[afterStart + j]!;
    const match =
      beforeToken.value === afterToken.value
        ? dp[i + 1]![j + 1]! + wordEmphasisTokenWeight(beforeToken.value)
        : Number.NEGATIVE_INFINITY;
    if (sameScore(dp[i]![j]!, match)) {
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      changed.removed.add(beforeStart + i);
      i++;
    } else {
      changed.added.add(afterStart + j);
      j++;
    }
  }
  while (i < beforeLength) {
    changed.removed.add(beforeStart + i);
    i++;
  }
  while (j < afterLength) {
    changed.added.add(afterStart + j);
    j++;
  }
}

function sameScore(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function uniqueOrderedAnchors(
  before: WordEmphasisToken[],
  beforeStart: number,
  beforeEnd: number,
  after: WordEmphasisToken[],
  afterStart: number,
  afterEnd: number,
): Array<{ beforeIndex: number; afterIndex: number }> {
  const beforeCounts = tokenCounts(before, beforeStart, beforeEnd);
  const afterCounts = tokenCounts(after, afterStart, afterEnd);
  const afterUniqueIndexes = new Map<string, number>();
  for (let index = afterStart; index < afterEnd; index++) {
    const value = after[index]!.value;
    if (beforeCounts.get(value) === 1 && afterCounts.get(value) === 1)
      afterUniqueIndexes.set(value, index);
  }
  const candidates: Array<{ beforeIndex: number; afterIndex: number }> = [];
  for (let index = beforeStart; index < beforeEnd; index++) {
    const value = before[index]!.value;
    if (beforeCounts.get(value) !== 1 || afterCounts.get(value) !== 1) continue;
    const afterIndex = afterUniqueIndexes.get(value);
    if (afterIndex !== undefined) candidates.push({ beforeIndex: index, afterIndex });
  }
  return longestIncreasingAfterIndexes(candidates);
}

function longestIncreasingAfterIndexes(
  candidates: Array<{ beforeIndex: number; afterIndex: number }>,
): Array<{ beforeIndex: number; afterIndex: number }> {
  if (candidates.length <= 1) return candidates;
  const tails: number[] = [];
  const previous = Array.from({ length: candidates.length }, () => -1);
  const tailCandidateIndexes: number[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const afterIndex = candidates[index]!.afterIndex;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle]! < afterIndex) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tailCandidateIndexes[low - 1]!;
    tails[low] = afterIndex;
    tailCandidateIndexes[low] = index;
  }

  const ordered: Array<{ beforeIndex: number; afterIndex: number }> = [];
  let index = tailCandidateIndexes[tails.length - 1] ?? -1;
  while (index >= 0) {
    ordered.push(candidates[index]!);
    index = previous[index] ?? -1;
  }
  return ordered.reverse();
}

function tokenCounts(tokens: WordEmphasisToken[], start: number, end: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = start; index < end; index++) {
    const value = tokens[index]!.value;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function markTokenRange(changed: Set<number>, start: number, end: number): void {
  for (let index = start; index < end; index++) changed.add(index);
}

type TokenGroup = { start: number; end: number };

const MAX_SOFT_TOKEN_ALIGNMENT_CELLS = 4096;
const MIN_SOFT_TOKEN_SUBSTITUTION_SIMILARITY = 0.45;

function refinedRangesForChangedTokens(
  beforeTokens: WordEmphasisToken[],
  afterTokens: WordEmphasisToken[],
  removedTokens: Set<number>,
  addedTokens: Set<number>,
): WordChangeRanges {
  const removedGroups = changedTokenGroups(beforeTokens, removedTokens);
  const addedGroups = changedTokenGroups(afterTokens, addedTokens);
  const removed: Array<[number, number]> = [];
  const added: Array<[number, number]> = [];
  const groupCount = Math.max(removedGroups.length, addedGroups.length);

  for (let index = 0; index < groupCount; index++) {
    const removedGroup = removedGroups[index];
    const addedGroup = addedGroups[index];
    const refined =
      removedGroup && addedGroup
        ? refinedChangedTokenGroupRanges(beforeTokens, removedGroup, afterTokens, addedGroup)
        : undefined;
    if (refined) {
      removed.push(...refined.removed);
      added.push(...refined.added);
      continue;
    }
    if (removedGroup) removed.push(...rangesForTokenGroup(beforeTokens, removedGroup));
    if (addedGroup) added.push(...rangesForTokenGroup(afterTokens, addedGroup));
  }

  return { removed: mergeRanges(removed), added: mergeRanges(added) };
}

function changedTokenGroups(tokens: WordEmphasisToken[], changed: Set<number>): TokenGroup[] {
  const groups: TokenGroup[] = [];
  let start: number | undefined;
  for (let index = 0; index < tokens.length; index++) {
    if (changed.has(index)) {
      start ??= index;
      continue;
    }
    if (start !== undefined) {
      groups.push({ start, end: index });
      start = undefined;
    }
  }
  if (start !== undefined) groups.push({ start, end: tokens.length });
  return groups;
}

function refinedChangedTokenGroupRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  return (
    refinedSingleTokenRanges(beforeTokens, beforeGroup, afterTokens, afterGroup) ??
    refinedSoftTokenGroupRanges(beforeTokens, beforeGroup, afterTokens, afterGroup)
  );
}

function refinedSingleTokenRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  if (beforeGroup.end - beforeGroup.start !== 1 || afterGroup.end - afterGroup.start !== 1)
    return undefined;
  return refinedTokenPairRanges(beforeTokens[beforeGroup.start]!, afterTokens[afterGroup.start]!);
}

function refinedTokenPairRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  const identifierRanges = refinedIdentifierTokenRanges(beforeToken, afterToken);
  const textRanges = refinedTokenTextRanges(beforeToken, afterToken);
  if (identifierRanges && isNarrowerThanWholeTokens(identifierRanges, beforeToken, afterToken)) {
    if (shouldSuppressUnbalancedIdentifierPartRefinement(beforeToken, afterToken, textRanges))
      return textRanges;
    return identifierRanges;
  }
  return textRanges ?? identifierRanges;
}

function shouldSuppressUnbalancedIdentifierPartRefinement(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
  textRanges: WordChangeRanges | undefined,
): boolean {
  if (textRanges) return false;
  if (!isIdentifierToken(beforeToken.value) || !isIdentifierToken(afterToken.value)) return false;
  const beforePartCount = splitIdentifierToken(beforeToken.value, 0).filter((part) =>
    isIdentifierSimilarityPart(part.value),
  ).length;
  const afterPartCount = splitIdentifierToken(afterToken.value, 0).filter((part) =>
    isIdentifierSimilarityPart(part.value),
  ).length;
  return Math.min(beforePartCount, afterPartCount) === 1 && beforePartCount !== afterPartCount;
}

function refinedSoftTokenGroupRanges(
  beforeTokens: WordEmphasisToken[],
  beforeGroup: TokenGroup,
  afterTokens: WordEmphasisToken[],
  afterGroup: TokenGroup,
): WordChangeRanges | undefined {
  const before = beforeTokens.slice(beforeGroup.start, beforeGroup.end);
  const after = afterTokens.slice(afterGroup.start, afterGroup.end);
  if (before.length * after.length > MAX_SOFT_TOKEN_ALIGNMENT_CELLS) return undefined;
  const pairs = softAlignedTokenPairs(before, after);
  if (pairs.length === 0) return undefined;

  const pairedBefore = new Set<number>();
  const pairedAfter = new Set<number>();
  const removed: Array<[number, number]> = [];
  const added: Array<[number, number]> = [];

  for (const [beforeIndex, afterIndex] of pairs) {
    pairedBefore.add(beforeIndex);
    pairedAfter.add(afterIndex);
    const beforeToken = before[beforeIndex]!;
    const afterToken = after[afterIndex]!;
    if (beforeToken.value === afterToken.value) continue;
    const refined = refinedTokenPairRanges(beforeToken, afterToken);
    if (refined) {
      removed.push(...refined.removed);
      added.push(...refined.added);
    } else {
      pushTokenRange(removed, beforeToken);
      pushTokenRange(added, afterToken);
    }
  }

  for (let index = 0; index < before.length; index++) {
    if (!pairedBefore.has(index)) pushTokenRange(removed, before[index]!);
  }
  for (let index = 0; index < after.length; index++) {
    if (!pairedAfter.has(index)) pushTokenRange(added, after[index]!);
  }

  const result = { removed: mergeRangesByStart(removed), added: mergeRangesByStart(added) };
  return result.removed.length > 0 || result.added.length > 0 ? result : undefined;
}

function softAlignedTokenPairs(
  before: WordEmphasisToken[],
  after: WordEmphasisToken[],
): Array<[number, number]> {
  const dp = Array.from({ length: before.length + 1 }, () => new Float64Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const substitution = softTokenSubstitutionWeight(before[i]!, after[j]!);
      const align = substitution > 0 ? dp[i + 1]![j + 1]! + substitution : 0;
      dp[i]![j] = Math.max(align, dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const substitution = softTokenSubstitutionWeight(before[i]!, after[j]!);
    const align = substitution > 0 ? dp[i + 1]![j + 1]! + substitution : 0;
    if (substitution > 0 && sameScore(dp[i]![j]!, align)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function softTokenSubstitutionWeight(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): number {
  if (beforeToken.value === afterToken.value) return wordEmphasisTokenWeight(beforeToken.value);
  const similarity = softTokenSimilarity(beforeToken.value, afterToken.value);
  return similarity >= MIN_SOFT_TOKEN_SUBSTITUTION_SIMILARITY
    ? Math.min(
        wordEmphasisTokenWeight(beforeToken.value),
        wordEmphasisTokenWeight(afterToken.value),
      ) * similarity
    : 0;
}

function softTokenSimilarity(before: string, after: string): number {
  if (isIdentifierToken(before) && isIdentifierToken(after))
    return identifierTokenSimilarity(before, after);
  if (isNumberToken(before) && isNumberToken(after)) return edgeTextSimilarity(before, after);
  if (isMeaningfulOperatorToken(before) && isMeaningfulOperatorToken(after))
    return edgeTextSimilarity(before, after);
  return 0;
}

function identifierTokenSimilarity(before: string, after: string): number {
  const beforeParts = splitIdentifierToken(before, 0)
    .map((part) => part.value.toLowerCase())
    .filter(isIdentifierSimilarityPart);
  const afterParts = splitIdentifierToken(after, 0)
    .map((part) => part.value.toLowerCase())
    .filter(isIdentifierSimilarityPart);
  const partSimilarity = tokenDiceSimilarity(beforeParts, afterParts);
  return Math.max(partSimilarity, edgeTextSimilarity(before, after));
}

function tokenDiceSimilarity(before: string[], after: string[]): number {
  if (before.length === 0 || after.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const token of before) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let shared = 0;
  for (const token of after) {
    const count = remaining.get(token) ?? 0;
    if (count === 0) continue;
    shared++;
    if (count === 1) remaining.delete(token);
    else remaining.set(token, count - 1);
  }
  return (2 * shared) / (before.length + after.length);
}

function edgeTextSimilarity(before: string, after: string): number {
  const prefix = commonPrefixLength(before, after);
  const suffix = commonSuffixLength(before, after, prefix);
  return (2 * (prefix + suffix)) / (before.length + after.length);
}

function refinedIdentifierTokenRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  if (!isIdentifierToken(beforeToken.value) || !isIdentifierToken(afterToken.value))
    return undefined;
  const beforeParts = splitIdentifierToken(beforeToken.value, beforeToken.start);
  const afterParts = splitIdentifierToken(afterToken.value, afterToken.start);
  if (beforeParts.length <= 1 && afterParts.length <= 1) return undefined;

  const removed = new Set<number>();
  const added = new Set<number>();
  collectChangedTokenIndexes(beforeParts, 0, beforeParts.length, afterParts, 0, afterParts.length, {
    removed,
    added,
  });
  const ranges = refinedRangesForChangedTokens(beforeParts, afterParts, removed, added);
  return hasWordChangeRanges(ranges) ? ranges : undefined;
}

function refinedTokenTextRanges(
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): WordChangeRanges | undefined {
  if (beforeToken.value === afterToken.value) return undefined;
  const prefix = commonPrefixLength(beforeToken.value, afterToken.value);
  const suffix = commonSuffixLength(beforeToken.value, afterToken.value, prefix);
  if (!shouldRefineTokenText(beforeToken.value, afterToken.value, prefix, suffix)) return undefined;

  const beforeStart = prefix;
  const beforeEnd = beforeToken.value.length - suffix;
  const afterStart = prefix;
  const afterEnd = afterToken.value.length - suffix;
  const removed: Array<[number, number]> =
    beforeStart < beforeEnd
      ? [[beforeToken.start + beforeStart, beforeToken.start + beforeEnd]]
      : [];
  const added: Array<[number, number]> =
    afterStart < afterEnd ? [[afterToken.start + afterStart, afterToken.start + afterEnd]] : [];
  return removed.length > 0 || added.length > 0 ? { removed, added } : undefined;
}

function shouldRefineTokenText(
  before: string,
  after: string,
  prefix: number,
  suffix: number,
): boolean {
  const sharedEdgeLength = prefix + suffix;
  if (sharedEdgeLength === 0) return false;
  if (isIdentifierToken(before) && isIdentifierToken(after)) {
    if (
      sharedEdgeLength < 2 &&
      !needsBoundarySafeOffsets(before) &&
      !needsBoundarySafeOffsets(after)
    )
      return false;
    if (prefix === 0 && suffix > 0) {
      const beforeChangedLength = before.length - suffix;
      const afterChangedLength = after.length - suffix;
      if (
        beforeChangedLength !== afterChangedLength &&
        Math.min(beforeChangedLength, afterChangedLength) < 2
      )
        return false;
    }
    return true;
  }
  if (isNumberToken(before) && isNumberToken(after)) return true;
  if (isMeaningfulOperatorToken(before) && isMeaningfulOperatorToken(after)) return true;
  return false;
}

function commonPrefixLength(before: string, after: string): number {
  if (!needsBoundarySafeOffsets(before) && !needsBoundarySafeOffsets(after))
    return commonPrefixCodeUnitLength(before, after);

  const beforeSegments = textBoundarySegments(before);
  const afterSegments = textBoundarySegments(after);
  let index = 0;
  let prefix = 0;
  while (
    index < beforeSegments.length &&
    index < afterSegments.length &&
    beforeSegments[index]!.value === afterSegments[index]!.value
  ) {
    prefix = beforeSegments[index]!.end;
    index++;
  }
  return prefix;
}

function commonSuffixLength(before: string, after: string, prefixLength: number): number {
  if (!needsBoundarySafeOffsets(before) && !needsBoundarySafeOffsets(after))
    return commonSuffixCodeUnitLength(before, after, prefixLength);

  const beforeSegments = textBoundarySegments(before);
  const afterSegments = textBoundarySegments(after);
  let beforeIndex = beforeSegments.length - 1;
  let afterIndex = afterSegments.length - 1;
  let suffix = 0;
  while (beforeIndex >= 0 && afterIndex >= 0) {
    const beforeSegment = beforeSegments[beforeIndex]!;
    const afterSegment = afterSegments[afterIndex]!;
    if (beforeSegment.start < prefixLength || afterSegment.start < prefixLength) break;
    if (beforeSegment.value !== afterSegment.value) break;
    suffix += beforeSegment.value.length;
    beforeIndex--;
    afterIndex--;
  }
  return suffix;
}

function commonPrefixCodeUnitLength(before: string, after: string): number {
  const end = Math.min(before.length, after.length);
  let index = 0;
  while (index < end && before[index] === after[index]) index++;
  return index;
}

function commonSuffixCodeUnitLength(before: string, after: string, prefixLength: number): number {
  const maxLength = Math.min(before.length, after.length) - prefixLength;
  let length = 0;
  while (
    length < maxLength &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  )
    length++;
  return length;
}

type TextBoundarySegment = { value: string; start: number; end: number };

const MARK_TEXT_PATTERN = /\p{Mark}/u;
const MARK_CODE_POINT_PATTERN = /^\p{Mark}$/u;
const SURROGATE_CODE_UNIT_PATTERN = /[\uD800-\uDFFF]/;

function needsBoundarySafeOffsets(text: string): boolean {
  return MARK_TEXT_PATTERN.test(text) || SURROGATE_CODE_UNIT_PATTERN.test(text);
}

function textBoundarySegments(text: string): TextBoundarySegment[] {
  const segments: TextBoundarySegment[] = [];
  for (let index = 0; index < text.length; ) {
    const start = index;
    const codePoint = text.codePointAt(index)!;
    const value = String.fromCodePoint(codePoint);
    index += value.length;

    if (MARK_CODE_POINT_PATTERN.test(value) && segments.length > 0) {
      const previous = segments.at(-1)!;
      previous.value += value;
      previous.end = index;
    } else {
      segments.push({ value, start, end: index });
    }
  }
  return segments;
}

function isNarrowerThanWholeTokens(
  ranges: WordChangeRanges,
  beforeToken: WordEmphasisToken,
  afterToken: WordEmphasisToken,
): boolean {
  return (
    ranges.removed.some((range) => range[0] > beforeToken.start || range[1] < beforeToken.end) ||
    ranges.added.some((range) => range[0] > afterToken.start || range[1] < afterToken.end) ||
    ranges.removed.length === 0 ||
    ranges.added.length === 0
  );
}

function rangesForTokenGroup(
  tokens: WordEmphasisToken[],
  group: TokenGroup,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let index = group.start; index < group.end; index++)
    appendTokenRange(ranges, tokens[index]!);
  return ranges;
}

function pushTokenRange(ranges: Array<[number, number]>, token: WordEmphasisToken): void {
  ranges.push([token.start, token.end]);
}

function appendTokenRange(ranges: Array<[number, number]>, token: WordEmphasisToken): void {
  const previous = ranges.at(-1);
  if (previous && token.start - previous[1] <= 1) previous[1] = token.end;
  else ranges.push([token.start, token.end]);
}

function mergeRangesByStart(ranges: Array<[number, number]>): Array<[number, number]> {
  return mergeRanges([...ranges].sort((a, b) => a[0] - b[0]));
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] - previous[1] <= 1) previous[1] = range[1];
    else merged.push([...range]);
  }
  return merged;
}

function filterLowSignalWordEmphasis(
  before: string,
  after: string,
  ranges: WordChangeRanges,
): WordChangeRanges {
  const hasRemovedSignal = ranges.removed.some((range) => hasSmartRangeSignal(before, range));
  const hasAddedSignal = ranges.added.some((range) => hasSmartRangeSignal(after, range));
  return {
    removed: ranges.removed.filter((range) =>
      shouldKeepSmartRange(before.slice(range[0], range[1]), hasAddedSignal),
    ),
    added: ranges.added.filter((range) =>
      shouldKeepSmartRange(after.slice(range[0], range[1]), hasRemovedSignal),
    ),
  };
}

function hasSmartRangeSignal(content: string, range: [number, number]): boolean {
  const tokens = wordTokenValues(content.slice(range[0], range[1]));
  return tokens.some(isSmartSignalToken);
}

function shouldKeepSmartRange(text: string, oppositeSideHasSignal: boolean): boolean {
  const tokens = wordTokenValues(text);
  const signalTokens = tokens.filter(isSmartSignalToken);
  if (signalTokens.length === 0) return false;
  const wordTokens = signalTokens.filter(
    (token) => isIdentifierToken(token) || isNumberToken(token),
  );
  const hasOperatorSignal = signalTokens.some(isMeaningfulOperatorToken);
  if (
    !oppositeSideHasSignal &&
    !hasOperatorSignal &&
    wordTokens.every((token) => LOW_SIGNAL_SYNTAX_TOKENS.has(token))
  )
    return false;
  if (!oppositeSideHasSignal && !hasOperatorSignal && isWrapperCallNoise(text, wordTokens))
    return false;
  return true;
}

function isSmartSignalToken(token: string): boolean {
  return isIdentifierToken(token) || isNumberToken(token) || isMeaningfulOperatorToken(token);
}

const LOW_SIGNAL_SYNTAX_TOKENS = new Set([
  "as",
  "async",
  "await",
  "const",
  "else",
  "export",
  "from",
  "function",
  "if",
  "import",
  "let",
  "return",
  "var",
]);

const WRAPPER_CALL_TOKENS = new Set(["filter", "flatMap", "forEach", "map", "reduce"]);

function isWrapperCallNoise(text: string, tokens: string[]): boolean {
  return (
    tokens.length === 1 &&
    WRAPPER_CALL_TOKENS.has(tokens[0]!) &&
    /^[\s.()[\]{};,]*[$_\p{L}][$_\p{L}\p{N}\p{Mark}]*[\s.()[\]{};,]*$/u.test(text)
  );
}
