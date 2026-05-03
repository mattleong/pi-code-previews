import { codePreviewSettings } from "./settings.ts";

export type WordChangeRanges = {
  removed: Array<[number, number]>;
  added: Array<[number, number]>;
};

type DiffToken = {
  value: string;
  start: number;
  end: number;
};

export function changedRanges(before: string, after: string): WordChangeRanges {
  const beforeTokens = tokenizeForWordEmphasis(before);
  const afterTokens = tokenizeForWordEmphasis(after);
  const removedTokens = new Set<number>();
  const addedTokens = new Set<number>();
  collectChangedTokenIndexes(
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
  const ranges = {
    removed: rangesForChangedTokens(beforeTokens, removedTokens),
    added: rangesForChangedTokens(afterTokens, addedTokens),
  };
  return codePreviewSettings.wordEmphasis === "smart"
    ? filterLowSignalWordEmphasis(before, after, ranges)
    : ranges;
}

const WORD_EMPHASIS_EXACT_LCS_MAX_CELLS = 4096;

function tokenizeForWordEmphasis(text: string): DiffToken[] {
  const tokens: DiffToken[] = [];
  const tokenPattern = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|==|!=|<=|>=|&&|\|\||[^\s]/g;
  for (const match of text.matchAll(tokenPattern)) {
    const value = match[0] ?? "";
    const start = match.index ?? 0;
    tokens.push({ value, start, end: start + value.length });
  }
  return tokens;
}

function collectChangedTokenIndexes(
  before: DiffToken[],
  beforeStart: number,
  beforeEnd: number,
  after: DiffToken[],
  afterStart: number,
  afterEnd: number,
  changed: { removed: Set<number>; added: Set<number> },
): void {
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
    return;
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
    return;
  }

  const anchors = uniqueOrderedAnchors(before, beforeStart, beforeEnd, after, afterStart, afterEnd);
  if (anchors.length === 0) {
    markTokenRange(changed.removed, beforeStart, beforeEnd);
    markTokenRange(changed.added, afterStart, afterEnd);
    return;
  }

  let previousBefore = beforeStart;
  let previousAfter = afterStart;
  for (const anchor of anchors) {
    collectChangedTokenIndexes(
      before,
      previousBefore,
      anchor.beforeIndex,
      after,
      previousAfter,
      anchor.afterIndex,
      changed,
    );
    previousBefore = anchor.beforeIndex + 1;
    previousAfter = anchor.afterIndex + 1;
  }
  collectChangedTokenIndexes(
    before,
    previousBefore,
    beforeEnd,
    after,
    previousAfter,
    afterEnd,
    changed,
  );
}

function collectChangedTokenIndexesByLcs(
  before: DiffToken[],
  beforeStart: number,
  beforeEnd: number,
  after: DiffToken[],
  afterStart: number,
  afterEnd: number,
  changed: { removed: Set<number>; added: Set<number> },
): void {
  const beforeLength = beforeEnd - beforeStart;
  const afterLength = afterEnd - afterStart;
  const dp = Array.from({ length: beforeLength + 1 }, () => new Uint16Array(afterLength + 1));

  for (let i = beforeLength - 1; i >= 0; i--) {
    for (let j = afterLength - 1; j >= 0; j--) {
      dp[i]![j] =
        before[beforeStart + i]!.value === after[afterStart + j]!.value
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < beforeLength && j < afterLength) {
    if (before[beforeStart + i]!.value === after[afterStart + j]!.value) {
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

function uniqueOrderedAnchors(
  before: DiffToken[],
  beforeStart: number,
  beforeEnd: number,
  after: DiffToken[],
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

function tokenCounts(tokens: DiffToken[], start: number, end: number): Map<string, number> {
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

function rangesForChangedTokens(
  tokens: DiffToken[],
  changed: Set<number>,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < tokens.length; index++) {
    if (!changed.has(index)) continue;
    const token = tokens[index]!;
    const previous = ranges.at(-1);
    if (previous && token.start - previous[1] <= 1) previous[1] = token.end;
    else ranges.push([token.start, token.end]);
  }
  return ranges;
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
  return /[A-Za-z0-9_$]/.test(content.slice(range[0], range[1]));
}

function shouldKeepSmartRange(text: string, oppositeSideHasSignal: boolean): boolean {
  if (!/[A-Za-z0-9_$]/.test(text)) return false;
  const tokens = text.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?/g) ?? [];
  if (tokens.length === 0) return false;
  if (!oppositeSideHasSignal && tokens.every((token) => LOW_SIGNAL_SYNTAX_TOKENS.has(token)))
    return false;
  if (!oppositeSideHasSignal && isWrapperCallNoise(text, tokens)) return false;
  return true;
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
    /^[\s.()[\]{};,]*[A-Za-z_$][\w$]*[\s.()[\]{};,]*$/.test(text)
  );
}
