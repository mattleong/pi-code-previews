import {
  changedLineTokens,
  indexedChangedLine,
  matchChangedLines,
  normalizedChangedContent,
  type ChangedLinePair,
  type IndexedChangedLine,
} from "./line-matching";
import type { DiffWordEmphasis } from "../../settings/types";
import {
  isAddedDiffLine,
  isRemovedDiffLine,
  type AddedDiffLine,
  type ParsedDiffLine,
  type RemovedDiffLine,
} from "../parse";
import { changedRangesForTokensWithConfidence } from "./emphasis";
import type { ConfidentWordChangeRanges } from "./types";

type ChangedLineBlockAnalysis = {
  removed: Array<IndexedChangedLine<RemovedDiffLine>>;
  added: Array<IndexedChangedLine<AddedDiffLine>>;
  pairs: ChangedLinePair[];
  ranges: ChangedLineRangePair[];
};

type ChangedLineRangePair = {
  pair: ChangedLinePair;
  ranges: ConfidentWordChangeRanges;
};

export function analyzeChangedLineBlock(
  block: ParsedDiffLine[],
  wordEmphasis: DiffWordEmphasis,
): ChangedLineBlockAnalysis {
  const removed: Array<IndexedChangedLine<RemovedDiffLine>> = [];
  const added: Array<IndexedChangedLine<AddedDiffLine>> = [];
  for (let index = 0; index < block.length; index++) {
    const line = block[index];
    if (line === undefined) continue;
    if (isRemovedDiffLine(line)) removed.push(indexedChangedLine(index, line));
    else if (isAddedDiffLine(line)) added.push(indexedChangedLine(index, line));
  }
  const removedByIndex = new Map(removed.map((line) => [line.index, line]));
  const addedByIndex = new Map(added.map((line) => [line.index, line]));
  const pairs = matchChangedLines(removed, added);
  const ranges: ChangedLineRangePair[] = [];

  for (const pair of pairs) {
    const removedLine = removedByIndex.get(pair.removedIndex);
    const addedLine = addedByIndex.get(pair.addedIndex);
    if (!removedLine || !addedLine) continue;
    ranges.push({
      pair,
      ranges: changedRangesForTokensWithConfidence(
        normalizedChangedContent(removedLine),
        normalizedChangedContent(addedLine),
        changedLineTokens(removedLine),
        changedLineTokens(addedLine),
        wordEmphasis,
      ),
    });
  }

  return { removed, added, pairs, ranges };
}
