import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLsToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { createCodePreviewToolShell } from "../preview/tool-shell";
import { renderPathListResult } from "./shared/path-list-result";

export function registerLs(pi: ExtensionAPI, cwd: string) {
  const originalLs = createLsToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();
  pi.registerTool({
    ...originalLs,
    renderShell: previewShell.renderShell,
    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, () => {
        const path = typeof args.path === "string" && args.path ? args.path : ".";
        return new Text(
          `${theme.fg("toolTitle", theme.bold("ls"))} ${renderDisplayPath(path, cwd, theme)}`,
          0,
          0,
        );
      });
    },
    renderResult(result, options, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) =>
        renderPathListResult(result, options, theme, renderContext, {
          cwd,
          previewEnabled: codePreviewSettings.lsResultPreview,
          collapsedLines: codePreviewSettings.pathListCollapsedLines,
          loadingLabel: "Listing…",
          errorLabel: "List failed",
          emptyMarker: "(empty directory)",
          emptyLabel: () => "Empty directory",
          footerNoun: "entries",
          iconMode: codePreviewSettings.pathIcons,
        }),
      );
    },
  });
}
