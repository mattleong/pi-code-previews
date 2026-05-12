import type { ExtensionAPI, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { createCodePreviewToolShell } from "../../preview/tool-shell";
import { renderPathListResult, type PathListResultConfig } from "./path-list-result";

type AnyToolDefinition = ToolDefinition<any, any, any>;

type PathListToolOptions = {
  createToolDefinition: (cwd: string) => AnyToolDefinition;
  renderCall: (args: Record<string, unknown>, theme: Theme, cwd: string) => Component;
  resultConfig: (cwd: string) => PathListResultConfig;
};

export function registerPathListTool(
  pi: ExtensionAPI,
  cwd: string,
  options: PathListToolOptions,
): void {
  const originalTool = options.createToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();
  pi.registerTool({
    ...originalTool,
    renderShell: previewShell.renderShell,
    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, () =>
        options.renderCall(args as Record<string, unknown>, theme, cwd),
      );
    },
    renderResult(result, resultOptions, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) =>
        renderPathListResult(
          result,
          resultOptions,
          theme,
          renderContext,
          options.resultConfig(cwd),
        ),
      );
    },
  });
}
