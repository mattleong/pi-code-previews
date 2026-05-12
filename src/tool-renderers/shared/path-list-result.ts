import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import { getTextContent } from "../../tool-data/results";
import { showingFooter, trimSingleTrailingNewline } from "../../preview/format";
import { renderPathListLines } from "../../path-list/render";
import { escapeControlChars } from "../../shared/terminal-text";
import { renderSelectedOutputLines } from "./preview-text";
import { renderHiddenPreviewPrelude, renderResultPrelude } from "./result-prelude";
import type { PathIconMode } from "../../settings/types";

export interface PathListResultConfig {
  cwd: string;
  iconMode: PathIconMode;
  previewEnabled: boolean;
  loadingLabel: string;
  errorLabel: string;
  emptyMarker: string;
  emptyLabel: (output: string) => string;
  collapsedLines: number;
  footerNoun: string;
}

interface PathListRenderContext {
  isError: boolean;
  state: Record<string, unknown>;
}

export function renderPathListResult(
  result: AgentToolResult<unknown>,
  { expanded, isPartial }: ToolRenderResultOptions,
  theme: Theme,
  context: PathListRenderContext,
  config: PathListResultConfig,
): Component {
  const output = trimSingleTrailingNewline(getTextContent(result.content));
  const prelude = renderResultPrelude({
    isPartial,
    theme,
    loadingLabel: config.loadingLabel,
    isError: context.isError,
    errorText: output.split("\n")[0] || config.errorLabel,
  });
  if (prelude) return prelude;
  const hiddenPrelude = renderHiddenPreviewPrelude({
    expanded,
    state: context.state,
    theme,
    hidePreview: !config.previewEnabled,
  });
  if (hiddenPrelude) return hiddenPrelude;
  if (!output || output === config.emptyMarker)
    return new Text(theme.fg("muted", config.emptyLabel(output)), 0, 0);
  if (expanded && !config.previewEnabled)
    return new Text(
      output
        .split("\n")
        .map((line) => theme.fg("toolOutput", escapeControlChars(line)))
        .join("\n"),
      0,
      0,
    );

  const rawLines = output.split("\n");
  const limit = expanded ? rawLines.length : config.collapsedLines;
  const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) =>
    renderPathListLines(chunk.join("\n"), config.cwd, theme, { iconMode: config.iconMode }),
  );
  let text = preview.lines.join("\n");
  if (preview.hidden > 0)
    text += showingFooter(theme, preview.shown, rawLines.length, config.footerNoun);
  return new Text(text, 0, 0);
}
