import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { SettingsList, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { registerToolRenderers } from "./src/renderers.ts";
import { getSettingsPath, loadSettingsFromDisk, saveSettingsToDisk } from "./src/settings-store.ts";
import { createSettingsItems } from "./src/settings-ui.ts";
import {
  setCodePreviewSettings,
  codePreviewSettings,
  updateSetting,
  type CodePreviewSettings,
} from "./src/settings.ts";
import { getShikiStatus, initializeShiki } from "./src/shiki.ts";
import {
  formatActiveCodePreviewTools,
  formatDisabledCodePreviewTools,
  formatPendingCodePreviewTools,
  formatSkippedCodePreviewToolLines,
} from "./src/tool-status.ts";
import { type CodePreviewToolName, formatEnabledCodePreviewTools } from "./src/tool-selection.ts";

/**
 * Syntax-highlighted code previews for pi.
 */
export default async function codePreviews(pi: ExtensionAPI) {
  const savedSettings = await loadSettingsFromDisk();
  if (savedSettings) setCodePreviewSettings(savedSettings);
  if (codePreviewSettings.syntaxHighlighting) void initializeShiki(codePreviewSettings.shikiTheme);
  const registeredTools = new Set<CodePreviewToolName>();

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
        `Syntax highlighting: ${codePreviewSettings.syntaxHighlighting ? "on" : "off"}`,
        `Read content preview: ${codePreviewSettings.readContentPreview ? "on" : "off"}`,
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

  pi.registerCommand("code-preview-settings", {
    description: "Configure code preview settings",
    handler: async (_args, ctx) => {
      const items = createSettingsItems(codePreviewSettings);
      await ctx.ui.custom((_tui, _theme, _kb, done) => {
        let list: SettingsList;
        list = new SettingsList(
          items,
          items.length + 2,
          getSettingsListTheme(),
          (id, value) => {
            const previousTheme = codePreviewSettings.shikiTheme;
            const resetRequested = id === "resetToDefaults" && value === "reset now";
            setCodePreviewSettings(updateSetting(codePreviewSettings, id, value));
            if (resetRequested) syncSettingsListValues(list);
            if (codePreviewSettings.shikiTheme !== previousTheme)
              void initializeShiki(codePreviewSettings.shikiTheme);
            void queueSettingsSave(codePreviewSettings)
              .then(() => {
                if (resetRequested)
                  ctx.ui.notify("Code preview settings reset to defaults", "info");
              })
              .catch((error) => {
                ctx.ui.notify(formatSettingsSaveError(error), "warning");
              });
          },
          () => {
            void flushSettingsSaveQueue()
              .catch(() => undefined)
              .finally(() => done(undefined));
          },
        );
        return list;
      });
    },
  });

  pi.on("session_start", (_event, ctx) => {
    registerToolRenderers(pi, ctx.cwd, { registeredTools });
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

let settingsSaveQueue: Promise<void> = Promise.resolve();

function queueSettingsSave(settings: CodePreviewSettings): Promise<void> {
  const snapshot = cloneSettingsForSave(settings);
  const nextSave = settingsSaveQueue
    .catch(() => undefined)
    .then(() => saveSettingsToDisk(snapshot));
  settingsSaveQueue = nextSave;
  return nextSave;
}

function flushSettingsSaveQueue(): Promise<void> {
  return settingsSaveQueue;
}

function cloneSettingsForSave(settings: CodePreviewSettings): CodePreviewSettings {
  return { ...settings, tools: [...settings.tools] };
}

function formatSettingsSaveError(error: unknown): string {
  return `Failed to save code preview settings: ${error instanceof Error ? error.message : String(error)}`;
}

function syncSettingsListValues(list: SettingsList): void {
  list.updateValue("shikiTheme", codePreviewSettings.shikiTheme);
  list.updateValue("diffIntensity", codePreviewSettings.diffIntensity);
  list.updateValue("wordEmphasis", codePreviewSettings.wordEmphasis);
  list.updateValue("tools", codePreviewSettings.tools.join(", "));
  list.updateValue("readContentPreview", codePreviewSettings.readContentPreview ? "on" : "off");
  list.updateValue("readCollapsedLines", String(codePreviewSettings.readCollapsedLines));
  list.updateValue("writeCollapsedLines", String(codePreviewSettings.writeCollapsedLines));
  list.updateValue("editCollapsedLines", String(codePreviewSettings.editCollapsedLines));
  list.updateValue("grepCollapsedLines", String(codePreviewSettings.grepCollapsedLines));
  list.updateValue("pathListCollapsedLines", String(codePreviewSettings.pathListCollapsedLines));
  list.updateValue("readLineNumbers", codePreviewSettings.readLineNumbers ? "on" : "off");
  list.updateValue("pathIcons", codePreviewSettings.pathIcons);
  list.updateValue("bashWarnings", codePreviewSettings.bashWarnings ? "on" : "off");
  list.updateValue("syntaxHighlighting", codePreviewSettings.syntaxHighlighting ? "on" : "off");
  list.updateValue("secretWarnings", codePreviewSettings.secretWarnings ? "on" : "off");
  list.updateValue("resetToDefaults", "keep current");
}
