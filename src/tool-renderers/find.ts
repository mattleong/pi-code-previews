import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFindToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { escapeControlChars } from "../preview/terminal-text";
import { createCodePreviewToolShell } from "../preview/tool-shell";
import { renderPathListResult } from "./shared/path-list-result";

export function registerFind(pi: ExtensionAPI, cwd: string) {
  const originalFind = createFindToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();
  pi.registerTool({
    ...originalFind,
    renderShell: previewShell.renderShell,
    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, () => {
        const pattern = typeof args.pattern === "string" ? args.pattern : "";
        const path = typeof args.path === "string" && args.path ? args.path : ".";
        return new Text(
          `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", escapeControlChars(pattern || "*"))} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`,
          0,
          0,
        );
      });
    },
    renderResult(result, options, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) =>
        renderPathListResult(result, options, theme, renderContext, {
          cwd,
          previewEnabled: codePreviewSettings.findResultPreview,
          collapsedLines: codePreviewSettings.pathListCollapsedLines,
          loadingLabel: "Finding…",
          errorLabel: "Find failed",
          emptyMarker: "No files found matching pattern",
          emptyLabel: (output) => output || "No files found",
          footerNoun: "paths",
          iconMode: codePreviewSettings.pathIcons,
        }),
      );
    },
  });
}
