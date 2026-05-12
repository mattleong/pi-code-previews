import type { Theme } from "@earendil-works/pi-coding-agent";
import { FullWidthDiffText, renderPlainDiff, renderSyntaxHighlightedDiff } from "../../diff";
import { previewFooter, showingFooter } from "../../preview/format";
import type { CodePreviewSettings } from "../../settings/types";
import { shouldSkipHighlight } from "../../syntax/shiki";

export function createDiffPreviewText(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  options: {
    totalLines: number;
    hiddenLineNoun: string;
    skipHighlightLabel: string;
    decorate?: (body: string) => string;
    invalidate?: () => void;
  },
): FullWidthDiffText {
  const { body, syntaxHighlightSkipped } = renderDiffPreviewBody(
    diff,
    lang,
    theme,
    limit,
    options.invalidate,
  );
  const decorated = appendDiffPreviewFooters(
    options.decorate ? options.decorate(body) : body,
    theme,
    {
      totalLines: options.totalLines,
      limit,
      hiddenLineNoun: options.hiddenLineNoun,
      syntaxHighlightSkipped,
      skipHighlightLabel: options.skipHighlightLabel,
    },
  );
  return new FullWidthDiffText(decorated, theme);
}

export function renderDiffPreviewBody(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate?: () => void,
): { body: string; syntaxHighlightSkipped: boolean } {
  const syntaxHighlightSkipped = shouldSkipHighlight(diff);
  return {
    body: syntaxHighlightSkipped
      ? renderPlainDiff(diff, theme, limit)
      : renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate),
    syntaxHighlightSkipped,
  };
}

export function diffPreviewLineLimit(
  totalLines: number,
  expanded: boolean,
  collapsedLines: CodePreviewSettings["editCollapsedLines"],
): number {
  return expanded || collapsedLines === "all" ? totalLines : collapsedLines;
}

export function appendDiffPreviewFooters(
  body: string,
  theme: Theme,
  options: {
    totalLines: number;
    limit: number;
    hiddenLineNoun: string;
    syntaxHighlightSkipped: boolean;
    skipHighlightLabel: string;
  },
): string {
  let text = body;
  if (options.totalLines > options.limit)
    text += showingFooter(theme, options.limit, options.totalLines, options.hiddenLineNoun);
  if (options.syntaxHighlightSkipped) text += previewFooter(theme, options.skipHighlightLabel);
  return text;
}
