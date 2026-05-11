import {
  changedLineTokens,
  indexedChangedLine,
  matchChangedLines,
  normalizedChangedContent,
  type ChangedLinePair,
  type IndexedChangedLine,
} from "./line-matching";
import {
  isAddedDiffLine,
  isRemovedDiffLine,
  type AddedDiffLine,
  type ParsedDiffLine,
  type RemovedDiffLine,
} from "../parse";
import { changedRangesForTokensWithConfidence, type ConfidentWordChangeRanges } from "./emphasis";

export type ChangedLineBlockAnalysis = {
  removed: Array<IndexedChangedLine<RemovedDiffLine>>;
  added: Array<IndexedChangedLine<AddedDiffLine>>;
  pairs: ChangedLinePair[];
  ranges: ChangedLineRangePair[];
};

export type ChangedLineRangePair = {
  pair: ChangedLinePair;
  ranges: ConfidentWordChangeRanges;
};

export function analyzeChangedLineBlock(block: ParsedDiffLine[]): ChangedLineBlockAnalysis {
  const removed = block.flatMap((line, index) =>
    isRemovedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const added = block.flatMap((line, index) =>
    isAddedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const removedByIndex = new Map(removed.map((line) => [line.index, line]));
  const addedByIndex = new Map(added.map((line) => [line.index, line]));
  const pairs = matchChangedLines(removed, added);
  const ranges: ChangedLineRangePair[] = [];

  for (const pair of pairs) {
    const removedLine = removedByIndex.get(pair.removedIndex)!;
    const addedLine = addedByIndex.get(pair.addedIndex)!;
    ranges.push({
      pair,
      ranges: changedRangesForTokensWithConfidence(
        normalizedChangedContent(removedLine),
        normalizedChangedContent(addedLine),
        changedLineTokens(removedLine),
        changedLineTokens(addedLine),
      ),
    });
  }

  return { removed, added, pairs, ranges };
}
