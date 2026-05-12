import type { Theme } from "@earendil-works/pi-coding-agent";
import { previewFooter, showingFooter } from "../../preview/format";
import { shouldSkipHighlight } from "../../syntax/shiki";
import { renderHighlightedPreviewText } from "./preview-text";
import { withSecretWarning } from "./secret-preview";

type ContentPreview = {
  text: string;
  total: number;
};

export function renderContentPreview(options: {
  content: string;
  limit: number;
  lang: string | undefined;
  theme: Theme;
  emptyLabel: string;
  skipHighlightLabel: string;
  invalidate?: () => void;
  lineNumbers?: { firstLine: number; lineNumberWidth?: number };
}): ContentPreview {
  const syntaxHighlightSkipped = shouldSkipHighlight(options.content);
  const preview = renderHighlightedPreviewText(
    options.content,
    options.limit,
    syntaxHighlightSkipped ? undefined : options.lang,
    options.theme,
    options.invalidate,
    options.lineNumbers,
  );
  let text = preview.lines.length
    ? withSecretWarning(options.content, options.theme, preview.lines.join("\n"))
    : options.theme.fg("muted", options.emptyLabel);
  if (preview.hidden > 0)
    text += showingFooter(options.theme, preview.shown, preview.total, "lines");
  if (syntaxHighlightSkipped) text += previewFooter(options.theme, options.skipHighlightLabel);
  return { text, total: preview.total };
}
