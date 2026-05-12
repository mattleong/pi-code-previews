import type { AddedDiffLine, RemovedDiffLine } from "../parse";
import { expandPreviewTabs } from "../../shared/preview-tabs";
import { escapeControlChars } from "../../shared/terminal-text";
import { wordEmphasisTokens, type WordEmphasisToken } from "./tokens";

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

function normalizeDiffContent(content: string): string {
  return escapeControlChars(expandPreviewTabs(content));
}
