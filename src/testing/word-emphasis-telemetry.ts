import type { DiffWordEmphasis } from "../settings/types";
import { splitLinesLimited } from "../shared/text-lines";
import { collectChangedDiffBlock } from "../diff/changed-blocks";
import { isChangedDiffLine, parseDiffLine, type ParsedDiffLine } from "../diff/parse";
import { analyzeChangedLineBlock } from "../diff/word/change-block";
import { shouldEmphasizeChangedPair } from "../diff/word/emphasis";
import type { WordChangeConfidence } from "../diff/word/types";

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
  wordEmphasis: DiffWordEmphasis = "smart",
): WordEmphasisTelemetry {
  const lines = splitLinesLimited(diff, limit);
  const parsedLines = lines.map(parseDiffLine);
  const telemetry = emptyWordEmphasisTelemetry();

  for (let i = 0; i < lines.length; i++) {
    const parsed = parsedLines[i];
    if (!parsed || !isChangedDiffLine(parsed)) continue;
    const { block, end } = collectChangedDiffBlock(parsedLines, i);
    addChangeBlockTelemetry(block, telemetry, wordEmphasis);
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

function addChangeBlockTelemetry(
  block: ParsedDiffLine[],
  telemetry: WordEmphasisTelemetry,
  wordEmphasis: DiffWordEmphasis,
): void {
  const analysis = analyzeChangedLineBlock(block, wordEmphasis);
  telemetry.changedBlocks++;
  telemetry.changedLines.removed += analysis.removed.length;
  telemetry.changedLines.added += analysis.added.length;
  telemetry.skippedPotentialPairs += Math.max(
    0,
    Math.min(analysis.removed.length, analysis.added.length) - analysis.pairs.length,
  );

  for (const pair of analysis.pairs) telemetry.pairConfidence[pair.confidence]++;
  for (const { pair, ranges } of analysis.ranges) {
    telemetry.rangeConfidence[ranges.confidence]++;
    if (shouldEmphasizeChangedPair(ranges, pair.confidence)) telemetry.emphasizedPairs++;
    else telemetry.skippedPairs++;
  }
}
