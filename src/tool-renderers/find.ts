import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFindToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { escapeControlChars } from "../shared/terminal-text";
import { registerPathListTool } from "./shared/path-list-tool";

export function registerFind(pi: ExtensionAPI, cwd: string) {
  registerPathListTool(pi, cwd, {
    createToolDefinition: createFindToolDefinition,
    renderCall(args, theme, cwd) {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const path = typeof args.path === "string" && args.path ? args.path : ".";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", escapeControlChars(pattern || "*"))} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`,
        0,
        0,
      );
    },
    resultConfig: (cwd) => ({
      cwd,
      iconMode: codePreviewSettings.pathIcons,
      previewEnabled: codePreviewSettings.findResultPreview,
      collapsedLines: codePreviewSettings.pathListCollapsedLines,
      loadingLabel: "Finding…",
      errorLabel: "Find failed",
      emptyMarker: "No files found matching pattern",
      emptyLabel: (output) => output || "No files found",
      footerNoun: "paths",
    }),
  });
}
