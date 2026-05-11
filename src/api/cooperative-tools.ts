import type {
  AgentToolResult,
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Container, Text, type Component } from "@earendil-works/pi-tui";
import { getTextContent } from "../tool-data";
import { codePreviewSettings, type ToolCallBackgroundMode } from "../settings/index";
import { escapeControlChars } from "../preview/terminal-text";
import { createCodePreviewToolShell } from "../preview/tool-shell";

export interface CodePreviewShellOptions {
  /**
   * Shell mode to apply. Defaults to the current code-preview setting.
   * Load saved settings before registration when another extension should respect user config.
   */
  mode?: ToolCallBackgroundMode;

  /**
   * Leave tools that already render their own shell untouched. Defaults to true to avoid
   * double-framing or overriding custom backgrounds from cooperating extensions.
   */
  preserveSelfShell?: boolean;
}

type AnyToolDefinition = ToolDefinition<any, any, any>;

/**
 * Decorate a cooperating tool definition with pi-code-previews' tool-call shell.
 *
 * This does not discover or wrap already-registered tools. The caller keeps ownership of the
 * underlying tool definition, including execute(), schemas, prompt metadata, and custom renderers.
 */
export function withCodePreviewShell<TTool extends AnyToolDefinition>(
  tool: TTool,
  options: CodePreviewShellOptions = {},
): TTool {
  const mode = options.mode ?? codePreviewSettings.toolCallBackground;
  const preserveSelfShell = options.preserveSelfShell ?? true;
  if (preserveSelfShell && tool.renderShell === "self") return tool;

  const previewShell = createCodePreviewToolShell(mode);
  const originalRenderCall = tool.renderCall;
  const originalRenderResult = tool.renderResult;

  return {
    ...tool,
    renderShell: previewShell.renderShell,
    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, (renderContext) => {
        if (originalRenderCall)
          return originalRenderCall.call(tool, args, theme, renderContext as never);
        return renderFallbackToolCall(tool, theme);
      });
    },
    renderResult(result, resultOptions, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        if (originalRenderResult)
          return originalRenderResult.call(
            tool,
            result,
            resultOptions,
            theme,
            renderContext as never,
          );
        return renderFallbackToolResult(result, resultOptions, theme, renderContext.isError);
      });
    },
  } as TTool;
}

function renderFallbackToolCall(tool: AnyToolDefinition, theme: Theme): Component {
  return new Text(theme.fg("toolTitle", theme.bold(tool.label || tool.name)), 0, 0);
}

function renderFallbackToolResult(
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  isError: boolean,
): Component {
  const output = getTextContent(result.content);
  if (!output) return new Container();
  const color = isError ? "error" : options.isPartial ? "warning" : "toolOutput";
  const text = output
    .split("\n")
    .map((line) => theme.fg(color, escapeControlChars(line)))
    .join("\n");
  return new Text(text, 0, 0);
}
