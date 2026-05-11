import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { PathIconMode } from "../../settings/index";
import { Text, type Component } from "@earendil-works/pi-tui";
import { getTextContent } from "../../tool-data";
import { showingFooter, trimSingleTrailingNewline } from "../../preview/format";
import { renderPathListLines } from "../../path-list/render";
import { escapeControlChars } from "../../preview/terminal-text";
import { renderSelectedOutputLines } from "./preview-text";
import { renderHiddenPreviewExpandHint } from "../../preview/tool-shell";

interface PathListResultConfig {
  cwd: string;
  previewEnabled: boolean;
  loadingLabel: string;
  errorLabel: string;
  emptyMarker: string;
  emptyLabel: (output: string) => string;
  collapsedLines: number;
  footerNoun: string;
  iconMode?: PathIconMode;
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
  if (isPartial) return new Text(theme.fg("warning", config.loadingLabel), 0, 0);
  const output = trimSingleTrailingNewline(getTextContent(result.content));
  if (context.isError)
    return new Text(
      theme.fg("error", escapeControlChars(output.split("\n")[0] || config.errorLabel)),
      0,
      0,
    );
  if (!expanded && !config.previewEnabled)
    return renderHiddenPreviewExpandHint(context.state, theme);
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
