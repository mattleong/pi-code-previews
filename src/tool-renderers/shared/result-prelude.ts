import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import { escapeControlChars } from "../../shared/terminal-text";
import { renderHiddenPreviewExpandHint } from "../../preview/tool-shell";

export function renderResultPrelude(options: {
  isPartial: boolean;
  theme: Theme;
  loadingLabel: string;
  isError?: boolean;
  errorText?: string;
}): Component | undefined {
  if (options.isPartial) return new Text(options.theme.fg("warning", options.loadingLabel), 0, 0);
  if (options.isError && options.errorText !== undefined)
    return new Text(options.theme.fg("error", escapeControlChars(options.errorText)), 0, 0);
  return undefined;
}

export function renderHiddenPreviewPrelude(options: {
  expanded: boolean;
  hidePreview: boolean;
  state: Record<string, unknown>;
  theme: Theme;
}): Component | undefined {
  if (!options.expanded && options.hidePreview)
    return renderHiddenPreviewExpandHint(options.state, options.theme);
  return undefined;
}
