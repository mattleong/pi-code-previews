import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import {
  changedRangesForTokensWithConfidence,
  wordEmphasisSimilarityTokenValues,
  wordEmphasisTokenWeight,
  wordEmphasisTokens,
  type ConfidentWordChangeRanges,
  type WordChangeConfidence,
  type WordEmphasisToken,
} from "./diff-word-emphasis.ts";
import { positiveEnvInteger } from "./env.ts";
import { codePreviewSettings } from "./settings.ts";
import { renderWithShiki } from "./shiki.ts";
import { escapeControlChars, visibleLength, wrapAnsiToWidth } from "./terminal-text.ts";

const DIFF_ADD_MARKER = "\u0000PI_DIFF_ADD\u0000";
const DIFF_REMOVE_MARKER = "\u0000PI_DIFF_REMOVE\u0000";

export class FullWidthDiffText implements Component {
  private cachedWidth: number | undefined;
  private cachedRows: string[] | undefined;

  constructor(
    private text: string,
    private readonly theme?: Theme,
  ) {}

  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedRows) return this.cachedRows;
    const diffBackground = createDiffBackgroundResolver(this.theme);
    const rows = this.text.split("\n").flatMap((rawLine) => {
      const { kind, line } = parseMarkedDiffLine(rawLine);
      const rows = wrapAnsiToWidth(line, width, DIFF_WRAP_ROWS, continuationPrefix(line));
      if (!kind) return rows.map((row) => truncateToWidth(row, width, ""));

      return rows.map((row) => {
        const truncated = truncateToWidth(row, width, "");
        const padding = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
        return diffLineBg(kind, truncated + padding, diffBackground);
      });
    });
    this.cachedWidth = width;
    this.cachedRows = rows;
    return rows;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedRows = undefined;
  }
}

const DIFF_WRAP_ROWS = positiveEnvInteger("CODE_PREVIEW_DIFF_WRAP_ROWS", 3);

type MarkedDiffLine = { kind?: "add" | "remove"; line: string };

function parseMarkedDiffLine(rawLine: string): MarkedDiffLine {
  if (rawLine.startsWith(DIFF_ADD_MARKER))
    return { kind: "add", line: rawLine.slice(DIFF_ADD_MARKER.length) };
  if (rawLine.startsWith(DIFF_REMOVE_MARKER))
    return { kind: "remove", line: rawLine.slice(DIFF_REMOVE_MARKER.length) };
  return { line: rawLine };
}

function continuationPrefix(line: string): string {
  const pipe = line.indexOf("│ ");
  if (pipe < 0) return "";
  return " ".repeat(visibleLength(line.slice(0, pipe + 2)));
}

export function summarizeDiff(diff: string): {
  additions: number;
  removals: number;
  replacements: number;
  insertions: number;
  deletions: number;
  totalLines: number;
  hunks: number;
} {
  let additions = 0;
  let removals = 0;
  let replacements = 0;
  let insertions = 0;
  let deletions = 0;
  let hunks = 0;
  let groupAdditions = 0;
  let groupRemovals = 0;
  let totalLines = 0;

  function flushChangeGroup() {
    if (groupAdditions === 0 && groupRemovals === 0) return;
    hunks++;
    if (groupAdditions > 0 && groupRemovals > 0) {
      replacements++;
      insertions += Math.max(0, groupAdditions - groupRemovals);
      deletions += Math.max(0, groupRemovals - groupAdditions);
    } else if (groupAdditions > 0) {
      insertions += groupAdditions;
    } else {
      deletions += groupRemovals;
    }
    groupAdditions = 0;
    groupRemovals = 0;
  }

  forEachSplitLine(diff, (line) => {
    totalLines++;
    const isAddition = line.startsWith("+") && !line.startsWith("+++");
    const isRemoval = line.startsWith("-") && !line.startsWith("---");

    if (isAddition) {
      additions++;
      groupAdditions++;
    } else if (isRemoval) {
      removals++;
      groupRemovals++;
    } else {
      flushChangeGroup();
    }
  });
  flushChangeGroup();

  return {
    additions,
    removals,
    replacements,
    insertions,
    deletions,
    totalLines,
    hunks,
  };
}

function forEachSplitLine(text: string, callback: (line: string) => void): void {
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    if (newline < 0) {
      callback(text.slice(start));
      break;
    }
    callback(text.slice(start, newline));
    start = newline + 1;
  }
}

function splitLinesLimited(text: string, limit: number): string[] {
  const max = Math.max(0, Math.floor(limit));
  if (Number.isNaN(max) || max <= 0) return [];
  const lines: string[] = [];
  let start = 0;
  while (start <= text.length && lines.length < max) {
    const newline = text.indexOf("\n", start);
    if (newline < 0) {
      lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, newline));
    start = newline + 1;
  }
  return lines;
}

export function renderSyntaxHighlightedDiff(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate?: () => void,
): string {
  return renderSyntaxHighlightedDiffWithWordEmphasis(
    diff,
    lang,
    theme,
    limit,
    invalidate,
    codePreviewSettings.wordEmphasis !== "off",
  );
}

export function createProgressiveSyntaxHighlightedDiffText(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  options: { decorate?: (body: string) => string; invalidate?: () => void } = {},
): FullWidthDiffText {
  const decorate = options.decorate ?? ((body: string) => body);
  const initialBody = renderSyntaxHighlightedDiffWithWordEmphasis(
    diff,
    lang,
    theme,
    limit,
    options.invalidate,
    codePreviewSettings.wordEmphasis !== "off",
  );
  const component = new FullWidthDiffText(decorate(initialBody), theme);
  return component;
}

function renderSyntaxHighlightedDiffWithWordEmphasis(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate: (() => void) | undefined,
  emphasizeChangedPairs: boolean,
): string {
  return renderDiff(diff, {
    lang,
    theme,
    limit,
    invalidate,
    syntaxHighlight: true,
    emphasizeChangedPairs,
  });
}

export function renderPlainDiff(diff: string, theme: Theme, limit: number): string {
  return renderDiff(diff, {
    theme,
    limit,
    syntaxHighlight: false,
    emphasizeChangedPairs: false,
  });
}

type DiffRenderOptions = {
  lang?: string;
  theme: Theme;
  limit: number;
  invalidate?: () => void;
  syntaxHighlight: boolean;
  emphasizeChangedPairs: boolean;
};

function renderDiff(diff: string, options: DiffRenderOptions): string {
  const lines = splitLinesLimited(diff, options.limit);
  const parsedLines = lines.map(parseDiffLine);
  const lineNumberWidth = diffLineNumberWidth(parsedLines);
  const out: string[] = [];
  const lang = options.syntaxHighlight ? options.lang : undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const parsed = parsedLines[i];
    if (!parsed) {
      out.push(renderSeparator(line, options.theme));
      continue;
    }

    if (options.emphasizeChangedPairs && isChangedDiffLine(parsed)) {
      const block: ParsedDiffLine[] = [];
      let end = i;
      while (end < lines.length) {
        const next = parsedLines[end];
        if (!next || !isChangedDiffLine(next)) break;
        block.push(next);
        end++;
      }
      out.push(
        ...renderChangeBlock(block, lang, options.theme, lineNumberWidth, options.invalidate),
      );
      i = end - 1;
      continue;
    }

    out.push(
      renderDiffParsedLine(parsed, lang, options.theme, lineNumberWidth, options.invalidate),
    );
  }

  return out.join("\n");
}

function renderSeparator(line: string, theme: Theme): string {
  const safeLine = escapeControlChars(line);
  const trimmed = safeLine.trim();
  if (trimmed === "...") return theme.fg("muted", "      --- unchanged lines hidden ---");
  if (trimmed.startsWith("@@")) return theme.fg("accent", theme.bold(safeLine));
  if (trimmed.startsWith("---") || trimmed.startsWith("+++")) return theme.fg("muted", safeLine);
  if (trimmed.startsWith("diff ") || trimmed.startsWith("index "))
    return theme.fg("muted", safeLine);
  return theme.fg("toolDiffContext", safeLine);
}

function renderDiffParsedLine(
  parsed: ParsedDiffLine,
  lang: string | undefined,
  theme: Theme,
  lineNumberWidth: number,
  invalidate?: () => void,
): string {
  const highlighted = highlightSingleLine(
    parsed.content.replace(/\t/g, "   "),
    lang,
    theme,
    invalidate,
  );
  const lineNumber = formatDiffLineNumber(parsed.lineNumber, lineNumberWidth);
  if (parsed.kind === "+")
    return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${lineNumber} │ `)}${highlighted}`;
  if (parsed.kind === "-")
    return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${lineNumber} │ `)}${highlighted}`;
  return dimAnsi(
    `${theme.fg("toolDiffContext", ` ${lineNumber} │ `)}${highlighted || theme.fg("toolDiffContext", "")}`,
  );
}

export type WordEmphasisTelemetry = {
  changedBlocks: number;
  changedLines: { removed: number; added: number };
  pairConfidence: Record<WordChangeConfidence, number>;
  rangeConfidence: Record<WordChangeConfidence, number>;
  emphasizedPairs: number;
  skippedPairs: number;
  skippedPotentialPairs: number;
};

function renderChangeBlock(
  block: ParsedDiffLine[],
  lang: string | undefined,
  theme: Theme,
  lineNumberWidth: number,
  invalidate?: () => void,
): string[] {
  const removed = block.flatMap((line, index) =>
    isRemovedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const added = block.flatMap((line, index) =>
    isAddedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const removedByIndex = new Map(removed.map((line) => [line.index, line]));
  const addedByIndex = new Map(added.map((line) => [line.index, line]));
  const emphasis = new Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }>();

  for (const pair of matchChangedLines(removed, added)) {
    const removedLine = removedByIndex.get(pair.removedIndex);
    const addedLine = addedByIndex.get(pair.addedIndex);
    if (!removedLine || !addedLine) continue;
    const ranges = changedRangesForTokensWithConfidence(
      normalizedChangedContent(removedLine),
      normalizedChangedContent(addedLine),
      changedLineTokens(removedLine),
      changedLineTokens(addedLine),
    );
    if (!shouldEmphasizeChangedPair(ranges, pair.confidence)) continue;
    emphasis.set(pair.removedIndex, { ranges: ranges.removed, kind: "remove" });
    emphasis.set(pair.addedIndex, { ranges: ranges.added, kind: "add" });
  }

  return block.map((line, index) => {
    const rendered = renderDiffParsedLine(line, lang, theme, lineNumberWidth, invalidate);
    const match = emphasis.get(index);
    return match ? emphasizeChangedSpans(rendered, match.ranges, match.kind) : rendered;
  });
}

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

type IndexedChangedLine<T extends AddedDiffLine | RemovedDiffLine> = {
  index: number;
  line: T;
  normalizedContent?: string;
  tokens?: WordEmphasisToken[];
  similarityTokenValues?: string[];
  similarityFeatureValues?: string[];
};

function indexedChangedLine<T extends AddedDiffLine | RemovedDiffLine>(
  index: number,
  line: T,
): IndexedChangedLine<T> {
  return { index, line };
}

function normalizedChangedContent(
  line: IndexedChangedLine<AddedDiffLine | RemovedDiffLine>,
): string {
  // Compute ranges against the same normalized text that Shiki/fallback rendering displays.
  // Otherwise tabs or escaped control chars shift the emphasis range by multiple cells.
  return (line.normalizedContent ??= normalizeDiffContent(line.line.content));
}

function changedLineTokens(
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

type ChangedLinePair = {
  removedIndex: number;
  addedIndex: number;
  confidence: WordChangeConfidence;
};

type ChangedLinePairCandidate = {
  removedPosition: number;
  addedPosition: number;
  score: number;
};

function matchChangedLines(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): ChangedLinePair[] {
  if (removed.length === 0 || added.length === 0) return [];
  if (removed.length * added.length > MAX_CHANGED_LINE_PAIR_CELLS)
    return matchChangedLinesByPosition(removed, added);
  const tokenWeight = similarityTokenWeight(removed, added);
  const scores = removed.map((removedLine) =>
    added.map((addedLine) =>
      tokenSimilarity(
        changedLineSimilarityFeatureValues(removedLine),
        changedLineSimilarityFeatureValues(addedLine),
        tokenWeight,
      ),
    ),
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
  const confidentPairs = confidentChangedLinePairs(
    removed,
    added,
    scores,
    addPositionalFallbackPairs(removed, added, scores, similarPairs),
  );
  return addHighConfidenceCrossingPairs(removed, added, scores, confidentPairs);
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
  const tokenWeight = similarityTokenWeight(removed, added);
  const featureDocumentCounts = similarityFeatureDocumentCounts(removed, added);
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
    if (hasUniqueSharedSimilarityFeature(removed[index]!, added[index]!, featureDocumentCounts)) {
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

function similarityFeatureDocumentCounts(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): Map<string, number> {
  const documentCounts = new Map<string, number>();
  for (const line of [...removed, ...added]) {
    for (const feature of new Set(changedLineSimilarityFeatureValues(line)))
      documentCounts.set(feature, (documentCounts.get(feature) ?? 0) + 1);
  }
  return documentCounts;
}

function hasUniqueSharedSimilarityFeature(
  removed: IndexedChangedLine<RemovedDiffLine>,
  added: IndexedChangedLine<AddedDiffLine>,
  documentCounts: Map<string, number>,
): boolean {
  const addedFeatures = new Set(changedLineSimilarityFeatureValues(added));
  for (const feature of new Set(changedLineSimilarityFeatureValues(removed))) {
    if (!addedFeatures.has(feature)) continue;
    if (documentCounts.get(feature) === 2 && tokenWeight(feature) >= 1) return true;
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

function similarityTokenWeight(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
): SimilarityTokenWeight {
  const featureLists = [...removed, ...added].map(changedLineSimilarityFeatureValues);
  const documentCounts = new Map<string, number>();
  for (const features of featureLists) {
    for (const feature of new Set(features))
      documentCounts.set(feature, (documentCounts.get(feature) ?? 0) + 1);
  }
  const lineCount = featureLists.length;
  const weights = new Map<string, number>();
  return (token) => {
    const cached = weights.get(token);
    if (cached !== undefined) return cached;
    const documentCount = documentCounts.get(token) ?? lineCount;
    const rarity = Math.min(3, 1 + Math.log((lineCount + 1) / (documentCount + 1)));
    const weight = tokenWeight(token) * rarity;
    weights.set(token, weight);
    return weight;
  };
}

function confidentChangedLinePairs(
  removed: Array<IndexedChangedLine<RemovedDiffLine>>,
  added: Array<IndexedChangedLine<AddedDiffLine>>,
  scores: number[][],
  pairs: Array<[number, number]>,
): ChangedLinePair[] {
  const removedPositions = new Map(removed.map((line, index) => [line.index, index]));
  const addedPositions = new Map(added.map((line, index) => [line.index, index]));
  const confidentPairs: ChangedLinePair[] = [];
  for (const [removedIndex, addedIndex] of pairs) {
    const removedPosition = removedPositions.get(removedIndex);
    const addedPosition = addedPositions.get(addedIndex);
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
  pairs: ChangedLinePair[],
): ChangedLinePair[] {
  const removedPositions = new Map(removed.map((line, index) => [line.index, index]));
  const addedPositions = new Map(added.map((line, index) => [line.index, index]));
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  for (const pair of pairs) {
    const removedPosition = removedPositions.get(pair.removedIndex);
    const addedPosition = addedPositions.get(pair.addedIndex);
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
      (removedPositions.get(a.removedIndex) ?? 0) - (removedPositions.get(b.removedIndex) ?? 0),
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

function dimAnsi(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

type DiffLineKind = "add" | "remove";

type DiffBackgroundResolver = (kind: DiffLineKind) => string | undefined;

function createDiffBackgroundResolver(theme?: Theme): DiffBackgroundResolver {
  const intensity = codePreviewSettings.diffIntensity;
  if (intensity === "off") return () => undefined;
  const cache: Partial<Record<DiffLineKind, string>> = {};
  return (kind) =>
    (cache[kind] ??=
      deriveDiffBg(kind, theme, intensity === "medium" ? 0.24 : 0.14) ??
      fallbackDiffBg(kind, intensity));
}

function diffLineBg(
  kind: DiffLineKind,
  line: string,
  diffBackground: DiffBackgroundResolver,
): string {
  // Full-width subtle backgrounds for changed lines. Re-apply after foreground
  // resets emitted by Shiki so token coloring does not punch holes in the bg.
  const bg = diffBackground(kind);
  if (!bg) return line;
  const coloredLine = line
    .replace(/\x1b\[39m/g, `\x1b[39m${bg}`)
    .replace(/\x1b\[49m/g, `\x1b[49m${bg}`);
  // Leave the diff background active at end-of-line. Pi's surrounding Box adds
  // the final right-padding cell before resetting the tool background, so that
  // padding inherits the diff background without the child exceeding its width.
  return bg + coloredLine;
}

function fallbackDiffBg(kind: DiffLineKind, intensity: "subtle" | "medium"): string {
  if (kind === "add") return intensity === "medium" ? "\x1b[48;2;22;68;40m" : "\x1b[48;2;10;42;26m";
  return intensity === "medium" ? "\x1b[48;2;78;36;40m" : "\x1b[48;2;50;24;30m";
}

function deriveDiffBg(
  kind: DiffLineKind,
  theme: Theme | undefined,
  intensity: number,
): string | undefined {
  const themed = theme as
    | (Theme & { getFgAnsi?: (key: string) => string; getBgAnsi?: (key: string) => string })
    | undefined;
  const fg = themed?.getFgAnsi?.(kind === "add" ? "toolDiffAdded" : "toolDiffRemoved");
  const fgRgb = parseAnsiRgb(fg ?? "");
  if (!fgRgb) return undefined;
  const base = parseAnsiRgb(
    themed?.getBgAnsi?.(kind === "add" ? "toolSuccessBg" : "toolErrorBg") ?? "",
  ) ??
    parseAnsiRgb(themed?.getBgAnsi?.("toolSuccessBg") ?? "") ?? { r: 0, g: 0, b: 0 };
  return `\x1b[48;2;${Math.round(base.r + (fgRgb.r - base.r) * intensity)};${Math.round(base.g + (fgRgb.g - base.g) * intensity)};${Math.round(base.b + (fgRgb.b - base.b) * intensity)}m`;
}

function parseAnsiRgb(ansi: string): { r: number; g: number; b: number } | undefined {
  const match = ansi.match(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
  if (!match) return undefined;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function normalizeDiffContent(content: string): string {
  return escapeControlChars(content.replace(/\t/g, "   "));
}

function shouldEmphasizeChangedPair(
  ranges: ConfidentWordChangeRanges,
  lineConfidence: WordChangeConfidence,
): boolean {
  if (ranges.removed.length === 0 && ranges.added.length === 0) return false;
  if (lineConfidence === "low") return false;
  if (ranges.confidence === "low" && lineConfidence !== "high") return false;
  return true;
}

function emphasizeChangedSpans(
  line: string,
  ranges: Array<[number, number]>,
  kind: "add" | "remove",
): string {
  if (ranges.length === 0) return line;
  const codeStart = findCodeStart(line);
  return (
    line.slice(0, codeStart) +
    injectVisibleRangeEmphasis(line.slice(codeStart), ranges, wordEmphasis(kind))
  );
}

function findCodeStart(line: string): number {
  const pipe = line.indexOf("│ ");
  if (pipe < 0) return 0;
  let index = pipe + "│ ".length;
  // Skip foreground resets emitted by theme.fg() around the gutter. These do not
  // correspond to visible code cells and should not count toward changed ranges.
  while (line[index] === "\x1b") {
    const end = line.indexOf("m", index);
    if (end < 0) break;
    index = end + 1;
  }
  return index;
}

function wordEmphasis(kind: "add" | "remove"): string {
  // Use a strong bg + bold so word emphasis remains visible after the full-line
  // diff background is re-applied in FullWidthDiffText.render().
  return kind === "add" ? "\x1b[48;2;64;132;82m\x1b[1m" : "\x1b[48;2;148;62;70m\x1b[1m";
}

function injectVisibleRangeEmphasis(
  ansi: string,
  ranges: Array<[number, number]>,
  open: string,
): string {
  let visible = 0;
  let rangeIndex = 0;
  let out = "";
  let active = false;
  for (let i = 0; i < ansi.length; i++) {
    const range = ranges[rangeIndex];
    if (ansi[i] === "\x1b") {
      const end = ansi.indexOf("m", i);
      if (end >= 0) {
        const seq = ansi.slice(i, end + 1);
        out += active && (seq === "\x1b[39m" || seq === "\x1b[22m") ? `${seq}${open}` : seq;
        i = end;
        continue;
      }
    }
    if (!active && range && visible === range[0]) {
      out += open;
      active = true;
    }
    if (active && range && visible === range[1]) {
      out += "\x1b[22m\x1b[49m";
      active = false;
      rangeIndex++;
    }
    out += ansi[i];
    visible++;
  }
  if (active) out += "\x1b[22m\x1b[49m";
  return out;
}

type ParsedDiffLine = { kind: "+" | "-" | " "; lineNumber: string; content: string };

function diffLineNumberWidth(lines: Array<ParsedDiffLine | null>): number {
  return lines.reduce((width, line) => Math.max(width, normalizedDiffLineNumber(line).length), 0);
}

function formatDiffLineNumber(lineNumber: string, width: number): string {
  return lineNumber.trim().padStart(width, " ");
}

function normalizedDiffLineNumber(line: ParsedDiffLine | null): string {
  return line?.lineNumber.trim() ?? "";
}

type AddedDiffLine = ParsedDiffLine & { kind: "+" };
type RemovedDiffLine = ParsedDiffLine & { kind: "-" };

function parseDiffLine(line: string): ParsedDiffLine | null {
  const match = line.match(/^([+\- ])(\s*\d*)\s(.*)$/);
  if (!match) return null;
  const kind = match[1];
  if (kind !== "+" && kind !== "-" && kind !== " ") return null;
  return { kind, lineNumber: match[2] ?? "", content: match[3] ?? "" };
}

function isAddedDiffLine(line: ParsedDiffLine | null): line is AddedDiffLine {
  return line?.kind === "+";
}

function isRemovedDiffLine(line: ParsedDiffLine | null): line is RemovedDiffLine {
  return line?.kind === "-";
}

function isChangedDiffLine(line: ParsedDiffLine): line is AddedDiffLine | RemovedDiffLine {
  return line.kind === "+" || line.kind === "-";
}

function highlightSingleLine(
  line: string,
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
): string {
  return (
    renderWithShiki(line, lang, invalidate)?.[0] ?? theme.fg("toolOutput", escapeControlChars(line))
  );
}
