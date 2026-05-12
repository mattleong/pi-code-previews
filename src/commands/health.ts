import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { codePreviewSettings } from "../settings/index";
import { formatOnOff } from "../settings/on-off";
import { getSettingsPath } from "../settings/store";
import { getShikiStatus } from "../syntax/shiki";
import { formatEnabledCodePreviewTools } from "../tools/selection";
import {
  formatActiveCodePreviewTools,
  formatDisabledCodePreviewTools,
  formatPendingCodePreviewTools,
  formatSkippedCodePreviewToolLines,
} from "../tools/status";

export function registerHealthCommand(pi: ExtensionAPI): void {
  pi.registerCommand("code-preview-health", {
    description: "Show code preview renderer health and settings",
    handler: async (_args, ctx) => {
      const status = getShikiStatus();
      const skippedLines = formatSkippedCodePreviewToolLines();
      const pendingTools = formatPendingCodePreviewTools();
      const lines = [
        "Code preview health",
        `Shiki initialized: ${status.initialized ? "yes" : "no"}`,
        `Shiki theme: ${codePreviewSettings.shikiTheme}`,
        `Syntax highlighting: ${formatOnOff(codePreviewSettings.syntaxHighlighting)}`,
        `Tool call background: ${codePreviewSettings.toolCallBackground}`,
        `Tool call timing: ${formatOnOff(codePreviewSettings.toolCallTiming)}`,
        `Read content preview: ${formatOnOff(codePreviewSettings.readContentPreview)}`,
        `Write content preview: ${formatOnOff(codePreviewSettings.writeContentPreview)}`,
        `Edit diff preview: ${formatOnOff(codePreviewSettings.editDiffPreview)}`,
        `Grep result preview: ${formatOnOff(codePreviewSettings.grepResultPreview)}`,
        `Find result preview: ${formatOnOff(codePreviewSettings.findResultPreview)}`,
        `Ls result preview: ${formatOnOff(codePreviewSettings.lsResultPreview)}`,
        `Bash result preview: ${formatOnOff(codePreviewSettings.bashResultPreview)}`,
        `Word-level diff emphasis: ${codePreviewSettings.wordEmphasis}`,
        `Configured tools: ${formatEnabledCodePreviewTools()}`,
        `Active previews: ${formatActiveCodePreviewTools()}`,
        `Skipped previews: ${skippedLines.length ? "" : "none"}`,
        ...skippedLines,
        `Disabled by config: ${formatDisabledCodePreviewTools()}`,
        ...(pendingTools === "none" ? [] : [`Pending registration: ${pendingTools}`]),
        `Cache: ${status.cacheSize}/${status.cacheLimit}`,
        `Loaded languages: ${status.loadedLanguages}`,
        `Pending languages: ${status.pendingLanguages}`,
        `Max highlight chars: ${status.maxHighlightChars}`,
        `Path icons: ${codePreviewSettings.pathIcons}`,
        `Settings file: ${getSettingsPath()}`,
      ];
      await ctx.ui.custom(
        (_tui, theme, _kb, done) =>
          new HealthPanel(
            lines.map((line, index) => (index === 0 ? theme.bold(line) : line)).join("\n"),
            done,
            (value) => theme.fg("dim", value),
          ),
        { overlay: true },
      );
    },
  });
}

class HealthPanel implements Component {
  private readonly text: string;

  constructor(
    text: string,
    private readonly done: (result?: undefined) => void,
    private readonly border: (value: string) => string,
  ) {
    this.text = `${text}\n\nPress any key to close`;
  }

  render(width: number): string[] {
    const frameWidth = Math.max(4, width);
    const innerWidth = frameWidth - 4;
    const content = this.text.split("\n").map((line) => truncateToWidth(line, innerWidth, "…"));
    const empty = this.frameLine("", innerWidth);
    return [
      this.border(`╭${"─".repeat(frameWidth - 2)}╮`),
      empty,
      ...content.map((line) => this.frameLine(line, innerWidth)),
      empty,
      this.border(`╰${"─".repeat(frameWidth - 2)}╯`),
    ];
  }

  invalidate(): void {
    // No cached rendering state.
  }

  handleInput(): void {
    this.done();
  }

  private frameLine(line: string, innerWidth: number): string {
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(line)));
    return `${this.border("│")} ${line}${padding} ${this.border("│")}`;
  }
}
