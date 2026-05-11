import { bundledThemes } from "shiki";
import { parsePositiveInteger, positiveEnvInteger } from "../config/env";
import { getObjectValue } from "../shared/objects";
import {
  ALL_CODE_PREVIEW_TOOLS,
  isCodePreviewToolName,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "../tools/names";

export type DiffBackgroundIntensity = "off" | "subtle" | "medium";
export type DiffWordEmphasis = "off" | "smart" | "all";
export type ToolCallBackgroundMode = "on" | "off" | "border";
export type PathIconMode = "off" | "unicode" | "nerd";

export interface CodePreviewSettings {
  shikiTheme: string;
  diffIntensity: DiffBackgroundIntensity;
  wordEmphasis: DiffWordEmphasis;
  toolCallBackground: ToolCallBackgroundMode;
  toolCallTiming: boolean;
  readCollapsedLines: number;
  readContentPreview: boolean;
  writeContentPreview: boolean;
  writeCollapsedLines: number;
  editDiffPreview: boolean;
  editCollapsedLines: number | "all";
  grepCollapsedLines: number;
  grepResultPreview: boolean;
  findResultPreview: boolean;
  lsResultPreview: boolean;
  pathListCollapsedLines: number;
  readLineNumbers: boolean;
  bashResultPreview: boolean;
  bashWarnings: boolean;
  syntaxHighlighting: boolean;
  secretWarnings: boolean;
  pathIcons: PathIconMode;
  tools: CodePreviewToolName[];
}

export const defaultCodePreviewSettings: CodePreviewSettings = {
  shikiTheme: envTheme("CODE_PREVIEW_THEME", "dark-plus"),
  diffIntensity: envDiffIntensity("CODE_PREVIEW_DIFF_INTENSITY", "subtle"),
  wordEmphasis: envDiffWordEmphasis("CODE_PREVIEW_WORD_EMPHASIS", "all"),
  toolCallBackground: envToolCallBackgroundMode("CODE_PREVIEW_TOOL_CALL_BACKGROUND", "on"),
  toolCallTiming: envBoolean("CODE_PREVIEW_TOOL_CALL_TIMING", true),
  readCollapsedLines: positiveEnvInteger("CODE_PREVIEW_READ_LINES", 10),
  readContentPreview: envBoolean("CODE_PREVIEW_READ_CONTENT", true),
  writeContentPreview: envBoolean("CODE_PREVIEW_WRITE_CONTENT", true),
  writeCollapsedLines: positiveEnvInteger("CODE_PREVIEW_WRITE_LINES", 10),
  editDiffPreview: envBoolean("CODE_PREVIEW_EDIT_DIFF", true),
  editCollapsedLines: envEditLines("CODE_PREVIEW_EDIT_LINES", 160),
  grepCollapsedLines: positiveEnvInteger("CODE_PREVIEW_GREP_LINES", 15),
  grepResultPreview: envBoolean("CODE_PREVIEW_GREP_RESULTS", true),
  findResultPreview: envBoolean("CODE_PREVIEW_FIND_RESULTS", true),
  lsResultPreview: envBoolean("CODE_PREVIEW_LS_RESULTS", true),
  pathListCollapsedLines: positiveEnvInteger("CODE_PREVIEW_PATH_LIST_LINES", 20),
  readLineNumbers: envBoolean("CODE_PREVIEW_READ_LINE_NUMBERS", true),
  bashResultPreview: envBoolean("CODE_PREVIEW_BASH_RESULTS", true),
  bashWarnings: envBoolean("CODE_PREVIEW_BASH_WARNINGS", true),
  syntaxHighlighting: envBoolean("CODE_PREVIEW_SYNTAX", true),
  secretWarnings: envBoolean("CODE_PREVIEW_SECRET_WARNINGS", true),
  pathIcons: envPathIconMode("CODE_PREVIEW_PATH_ICONS", "unicode"),
  tools: [...ALL_CODE_PREVIEW_TOOLS],
};

export const CODE_PREVIEW_SETTING_KEYS = Object.keys(
  defaultCodePreviewSettings,
) as readonly (keyof CodePreviewSettings)[];

export type CodePreviewEditableSettingId = keyof CodePreviewSettings | "resetToDefaults";

export const codePreviewSettings: CodePreviewSettings = cloneCodePreviewSettings(
  defaultCodePreviewSettings,
);

export function setCodePreviewSettings(next: CodePreviewSettings) {
  Object.assign(codePreviewSettings, cloneCodePreviewSettings(next));
}

export function cloneCodePreviewSettings(settings: CodePreviewSettings): CodePreviewSettings {
  return { ...settings, tools: [...settings.tools] };
}

export function formatToolsSettingValue(tools: readonly CodePreviewToolName[]): string {
  return tools.length ? tools.join(", ") : "none";
}

export function formatSettingValue(
  settings: CodePreviewSettings,
  id: CodePreviewEditableSettingId,
): string {
  if (id === "resetToDefaults") return "keep current";
  if (id === "tools") return formatToolsSettingValue(settings.tools);
  const value = settings[id];
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

export function normalizeSettings(
  data: unknown,
  fallback: CodePreviewSettings = codePreviewSettings,
): CodePreviewSettings {
  const shikiTheme = getObjectValue(data, "shikiTheme");
  const diffIntensity = getObjectValue(data, "diffIntensity");
  const wordEmphasis = getObjectValue(data, "wordEmphasis");
  const toolCallBackground = getObjectValue(data, "toolCallBackground");
  const toolCallTiming = getObjectValue(data, "toolCallTiming");
  const readContentPreview = getObjectValue(data, "readContentPreview");
  const writeContentPreview = getObjectValue(data, "writeContentPreview");
  const editDiffPreview = getObjectValue(data, "editDiffPreview");
  const grepResultPreview = getObjectValue(data, "grepResultPreview");
  const findResultPreview = getObjectValue(data, "findResultPreview");
  const lsResultPreview = getObjectValue(data, "lsResultPreview");
  const readLineNumbers = getObjectValue(data, "readLineNumbers");
  const bashResultPreview = getObjectValue(data, "bashResultPreview");
  const bashWarnings = getObjectValue(data, "bashWarnings");
  const syntaxHighlighting = getObjectValue(data, "syntaxHighlighting");
  const secretWarnings = getObjectValue(data, "secretWarnings");
  const pathIcons = getObjectValue(data, "pathIcons");
  return withRequiredToolRenderers({
    shikiTheme: isBundledThemeName(shikiTheme) ? shikiTheme : fallback.shikiTheme,
    diffIntensity: isDiffBackgroundIntensity(diffIntensity)
      ? diffIntensity
      : fallback.diffIntensity,
    wordEmphasis: isDiffWordEmphasis(wordEmphasis) ? wordEmphasis : fallback.wordEmphasis,
    toolCallBackground: coerceToolCallBackgroundMode(
      toolCallBackground,
      fallback.toolCallBackground,
    ),
    toolCallTiming: typeof toolCallTiming === "boolean" ? toolCallTiming : fallback.toolCallTiming,
    readCollapsedLines: coerceNumber(
      getObjectValue(data, "readCollapsedLines"),
      fallback.readCollapsedLines,
    ),
    readContentPreview:
      typeof readContentPreview === "boolean" ? readContentPreview : fallback.readContentPreview,
    writeContentPreview:
      typeof writeContentPreview === "boolean" ? writeContentPreview : fallback.writeContentPreview,
    writeCollapsedLines: coerceNumber(
      getObjectValue(data, "writeCollapsedLines"),
      fallback.writeCollapsedLines,
    ),
    editDiffPreview:
      typeof editDiffPreview === "boolean" ? editDiffPreview : fallback.editDiffPreview,
    editCollapsedLines: coerceEditPreviewLines(
      getObjectValue(data, "editCollapsedLines"),
      fallback.editCollapsedLines,
    ),
    grepCollapsedLines: coerceNumber(
      getObjectValue(data, "grepCollapsedLines"),
      fallback.grepCollapsedLines,
    ),
    grepResultPreview:
      typeof grepResultPreview === "boolean" ? grepResultPreview : fallback.grepResultPreview,
    findResultPreview:
      typeof findResultPreview === "boolean" ? findResultPreview : fallback.findResultPreview,
    lsResultPreview:
      typeof lsResultPreview === "boolean" ? lsResultPreview : fallback.lsResultPreview,
    pathListCollapsedLines: coerceNumber(
      getObjectValue(data, "pathListCollapsedLines"),
      fallback.pathListCollapsedLines,
    ),
    readLineNumbers:
      typeof readLineNumbers === "boolean" ? readLineNumbers : fallback.readLineNumbers,
    bashResultPreview:
      typeof bashResultPreview === "boolean" ? bashResultPreview : fallback.bashResultPreview,
    bashWarnings: typeof bashWarnings === "boolean" ? bashWarnings : fallback.bashWarnings,
    syntaxHighlighting:
      typeof syntaxHighlighting === "boolean" ? syntaxHighlighting : fallback.syntaxHighlighting,
    secretWarnings: typeof secretWarnings === "boolean" ? secretWarnings : fallback.secretWarnings,
    pathIcons: isPathIconMode(pathIcons) ? pathIcons : fallback.pathIcons,
    tools: coerceTools(getObjectValue(data, "tools"), fallback.tools),
  });
}

type SettingUpdater = (
  next: CodePreviewSettings,
  current: CodePreviewSettings,
  value: string,
) => void;

const SETTING_UPDATERS = {
  shikiTheme: (next, _current, value) => {
    if (isBundledThemeName(value)) next.shikiTheme = value;
  },
  diffIntensity: (next, _current, value) => {
    if (isDiffBackgroundIntensity(value)) next.diffIntensity = value;
  },
  wordEmphasis: (next, _current, value) => {
    if (isDiffWordEmphasis(value)) next.wordEmphasis = value;
  },
  toolCallBackground: (next, _current, value) => {
    if (isToolCallBackgroundMode(value)) next.toolCallBackground = value;
  },
  toolCallTiming: (next, _current, value) => {
    next.toolCallTiming = value === "on";
  },
  readCollapsedLines: (next, current, value) => {
    next.readCollapsedLines = coerceStringNumber(value, current.readCollapsedLines);
  },
  readContentPreview: (next, _current, value) => {
    next.readContentPreview = value === "on";
  },
  writeContentPreview: (next, _current, value) => {
    next.writeContentPreview = value === "on";
  },
  writeCollapsedLines: (next, current, value) => {
    next.writeCollapsedLines = coerceStringNumber(value, current.writeCollapsedLines);
  },
  editDiffPreview: (next, _current, value) => {
    next.editDiffPreview = value === "on";
  },
  editCollapsedLines: (next, current, value) => {
    next.editCollapsedLines =
      value === "all"
        ? "all"
        : coerceStringNumber(
            value,
            typeof current.editCollapsedLines === "number" ? current.editCollapsedLines : 100,
          );
  },
  grepCollapsedLines: (next, current, value) => {
    next.grepCollapsedLines = coerceStringNumber(value, current.grepCollapsedLines);
  },
  grepResultPreview: (next, _current, value) => {
    next.grepResultPreview = value === "on";
  },
  findResultPreview: (next, _current, value) => {
    next.findResultPreview = value === "on";
  },
  lsResultPreview: (next, _current, value) => {
    next.lsResultPreview = value === "on";
  },
  pathListCollapsedLines: (next, current, value) => {
    next.pathListCollapsedLines = coerceStringNumber(value, current.pathListCollapsedLines);
  },
  readLineNumbers: (next, _current, value) => {
    next.readLineNumbers = value === "on";
  },
  bashResultPreview: (next, _current, value) => {
    next.bashResultPreview = value === "on";
  },
  bashWarnings: (next, _current, value) => {
    next.bashWarnings = value === "on";
  },
  syntaxHighlighting: (next, _current, value) => {
    next.syntaxHighlighting = value === "on";
  },
  secretWarnings: (next, _current, value) => {
    next.secretWarnings = value === "on";
  },
  pathIcons: (next, _current, value) => {
    if (isPathIconMode(value)) next.pathIcons = value;
  },
  tools: (next, current, value) => {
    next.tools = coerceTools(value, current.tools);
  },
} satisfies Record<keyof CodePreviewSettings, SettingUpdater>;

export function updateSetting(
  current: CodePreviewSettings,
  id: string,
  value: string,
): CodePreviewSettings {
  if (id === "resetToDefaults" && value === "reset now")
    return cloneCodePreviewSettings(defaultCodePreviewSettings);

  const next = cloneCodePreviewSettings(current);
  const updater = getSettingUpdater(id);
  if (updater) updater(next, current, value);
  else if (id.startsWith("tool:")) next.tools = updateToolToggle(current.tools, id, value);
  return withRequiredToolRenderers(next);
}

function getSettingUpdater(id: string): SettingUpdater | undefined {
  return Object.hasOwn(SETTING_UPDATERS, id)
    ? SETTING_UPDATERS[id as keyof CodePreviewSettings]
    : undefined;
}

function envTheme(name: string, fallback: string): string {
  const value = process.env[name];
  return isBundledThemeName(value) ? value : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.toLowerCase();
  if (value === undefined) return fallback;
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function envEditLines(name: string, fallback: number | "all"): number | "all" {
  const value = process.env[name];
  if (value === "all") return "all";
  return parsePositiveInteger(value) ?? fallback;
}

function envDiffIntensity(
  name: string,
  fallback: DiffBackgroundIntensity,
): DiffBackgroundIntensity {
  const value = process.env[name];
  return isDiffBackgroundIntensity(value) ? value : fallback;
}

function envDiffWordEmphasis(name: string, fallback: DiffWordEmphasis): DiffWordEmphasis {
  const value = process.env[name]?.toLowerCase();
  return isDiffWordEmphasis(value) ? value : fallback;
}

function envToolCallBackgroundMode(
  name: string,
  fallback: ToolCallBackgroundMode,
): ToolCallBackgroundMode {
  const value = process.env[name]?.toLowerCase();
  if (value === undefined) return fallback;
  if (isToolCallBackgroundMode(value)) return value;
  if (value === "1" || value === "true" || value === "yes") return "on";
  if (value === "0" || value === "false" || value === "no") return "off";
  return fallback;
}

function envPathIconMode(name: string, fallback: PathIconMode): PathIconMode {
  const value = process.env[name]?.toLowerCase();
  return isPathIconMode(value) ? value : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function coerceStringNumber(value: string, fallback: number): number {
  return parsePositiveInteger(value) ?? fallback;
}

function coerceEditPreviewLines(value: unknown, fallback: number | "all"): number | "all" {
  if (value === "all") return "all";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return fallback;
}

function coerceToolCallBackgroundMode(
  value: unknown,
  fallback: ToolCallBackgroundMode,
): ToolCallBackgroundMode {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (isToolCallBackgroundMode(normalized)) return normalized;
    if (normalized === "1" || normalized === "true" || normalized === "yes") return "on";
    if (normalized === "0" || normalized === "false" || normalized === "no") return "off";
  }
  return fallback;
}

function coerceTools(value: unknown, fallback: CodePreviewToolName[]): CodePreviewToolName[] {
  if (typeof value === "string") return [...(parseCodePreviewTools(value) ?? fallback)];
  if (!Array.isArray(value)) return fallback;
  const tools = value.filter(
    (tool): tool is CodePreviewToolName => typeof tool === "string" && isCodePreviewToolName(tool),
  );
  return [...new Set(tools)];
}

export function getRequiredCodePreviewTools(
  settings: CodePreviewSettings = codePreviewSettings,
): Set<CodePreviewToolName> {
  const tools = new Set<CodePreviewToolName>();
  if (!settings.readContentPreview) tools.add("read");
  if (!settings.writeContentPreview) tools.add("write");
  if (!settings.editDiffPreview) tools.add("edit");
  if (!settings.grepResultPreview) tools.add("grep");
  if (!settings.findResultPreview) tools.add("find");
  if (!settings.lsResultPreview) tools.add("ls");
  if (
    !settings.bashResultPreview ||
    !settings.grepResultPreview ||
    !settings.findResultPreview ||
    !settings.lsResultPreview
  )
    tools.add("bash");
  return tools;
}

function withRequiredToolRenderers(settings: CodePreviewSettings): CodePreviewSettings {
  const tools = new Set(settings.tools);
  for (const tool of getRequiredCodePreviewTools(settings)) tools.add(tool);
  return {
    ...settings,
    tools: ALL_CODE_PREVIEW_TOOLS.filter((tool) => tools.has(tool)),
  };
}

function updateToolToggle(
  currentTools: CodePreviewToolName[],
  id: string,
  value: string,
): CodePreviewToolName[] {
  const tool = id.slice("tool:".length);
  if (!isCodePreviewToolName(tool)) return currentTools;
  const enabled = new Set(currentTools);
  if (value === "on") enabled.add(tool);
  else if (value === "off") enabled.delete(tool);
  return ALL_CODE_PREVIEW_TOOLS.filter((candidate) => enabled.has(candidate));
}

function isDiffBackgroundIntensity(value: unknown): value is DiffBackgroundIntensity {
  return value === "off" || value === "subtle" || value === "medium";
}

function isDiffWordEmphasis(value: unknown): value is DiffWordEmphasis {
  return value === "off" || value === "smart" || value === "all";
}

function isToolCallBackgroundMode(value: unknown): value is ToolCallBackgroundMode {
  return value === "on" || value === "off" || value === "border";
}

function isPathIconMode(value: unknown): value is PathIconMode {
  return value === "off" || value === "unicode" || value === "nerd";
}

function isBundledThemeName(value: unknown): value is string {
  return typeof value === "string" && value in bundledThemes;
}
