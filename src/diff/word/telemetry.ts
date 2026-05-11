import { splitLinesLimited } from "../../shared/text-lines";
import {
  changedLineTokens,
  indexedChangedLine,
  matchChangedLines,
  normalizedChangedContent,
} from "../line-matching";
import {
  isAddedDiffLine,
  isChangedDiffLine,
  isRemovedDiffLine,
  parseDiffLine,
  type ParsedDiffLine,
} from "../parse";
import {
  changedRangesForTokensWithConfidence,
  shouldEmphasizeChangedPair,
  type WordChangeConfidence,
} from "./emphasis";

export type WordEmphasisTelemetry = {
  changedBlocks: number;
  changedLines: { removed: number; added: number };
  pairConfidence: Record<WordChangeConfidence, number>;
  rangeConfidence: Record<WordChangeConfidence, number>;
  emphasizedPairs: number;
  skippedPairs: number;
  skippedPotentialPairs: number;
};

export function wordEmphasisTelemetry(
  diff: string,
  limit = Number.MAX_SAFE_INTEGER,
): WordEmphasisTelemetry {
  const lines = splitLinesLimited(diff, limit);
  const parsedLines = lines.map(parseDiffLine);
  const telemetry = emptyWordEmphasisTelemetry();

  for (let i = 0; i < lines.length; i++) {
    const parsed = parsedLines[i];
    if (!parsed || !isChangedDiffLine(parsed)) continue;
    const block: ParsedDiffLine[] = [];
    let end = i;
    while (end < lines.length) {
      const next = parsedLines[end];
      if (!next || !isChangedDiffLine(next)) break;
      block.push(next);
      end++;
    }
    addChangeBlockTelemetry(block, telemetry);
    i = end - 1;
  }

  return telemetry;
}

function emptyWordEmphasisTelemetry(): WordEmphasisTelemetry {
  return {
    changedBlocks: 0,
    changedLines: { removed: 0, added: 0 },
    pairConfidence: { high: 0, medium: 0, low: 0 },
    rangeConfidence: { high: 0, medium: 0, low: 0 },
    emphasizedPairs: 0,
    skippedPairs: 0,
    skippedPotentialPairs: 0,
  };
}

function addChangeBlockTelemetry(block: ParsedDiffLine[], telemetry: WordEmphasisTelemetry): void {
  const removed = block.flatMap((line, index) =>
    isRemovedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const added = block.flatMap((line, index) =>
    isAddedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  telemetry.changedBlocks++;
  telemetry.changedLines.removed += removed.length;
  telemetry.changedLines.added += added.length;
  const removedByIndex = new Map(removed.map((line) => [line.index, line]));
  const addedByIndex = new Map(added.map((line) => [line.index, line]));
  const pairs = matchChangedLines(removed, added);
  telemetry.skippedPotentialPairs += Math.max(
    0,
    Math.min(removed.length, added.length) - pairs.length,
  );

  for (const pair of pairs) {
    telemetry.pairConfidence[pair.confidence]++;
    const removedLine = removedByIndex.get(pair.removedIndex);
    const addedLine = addedByIndex.get(pair.addedIndex);
    if (!removedLine || !addedLine) {
      telemetry.skippedPairs++;
      continue;
    }
    const ranges = changedRangesForTokensWithConfidence(
      normalizedChangedContent(removedLine),
      normalizedChangedContent(addedLine),
      changedLineTokens(removedLine),
      changedLineTokens(addedLine),
    );
    telemetry.rangeConfidence[ranges.confidence]++;
    if (shouldEmphasizeChangedPair(ranges, pair.confidence)) telemetry.emphasizedPairs++;
    else telemetry.skippedPairs++;
  }
}
