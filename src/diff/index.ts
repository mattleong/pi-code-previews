export { FullWidthDiffText } from "./full-width-text";
export {
  createProgressiveSyntaxHighlightedDiffText,
  renderPlainDiff,
  renderSyntaxHighlightedDiff,
} from "./render";
export { createSimpleDiff, createStructuredDiff } from "./structured";
export type { StructuredDiffHunk, StructuredDiffLine } from "./structured";
export {
  describeDiffShape,
  diffSummarySeparator,
  summarizeDiff,
  type DiffSummary,
} from "./summary";
export { wordEmphasisTelemetry, type WordEmphasisTelemetry } from "./word/telemetry";
