import { bundledThemes } from "shiki";
import { parsePositiveInteger, positiveEnvInteger } from "../config/env";
import { getObjectValue } from "../shared/objects";
import { formatToolsSettingValue, getEffectiveCodePreviewTools } from "../tools/policy";
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

type CodePreviewSettingDescriptor<K extends keyof CodePreviewSettings> = {
  normalize(value: unknown, fallback: CodePreviewSettings[K]): CodePreviewSettings[K];
  update(next: CodePreviewSettings, current: CodePreviewSettings, value: string): void;
};

type CodePreviewSettingDescriptors = {
  [K in keyof CodePreviewSettings]: CodePreviewSettingDescriptor<K>;
};

export const CODE_PREVIEW_SETTING_DEFINITIONS = {
  shikiTheme: {
    normalize: (value, fallback) => coerceSetting(value, fallback, isBundledThemeName),
    update: (next, _current, value) => {
      if (isBundledThemeName(value)) next.shikiTheme = value;
    },
  },
  diffIntensity: {
    normalize: (value, fallback) => coerceSetting(value, fallback, isDiffBackgroundIntensity),
    update: (next, _current, value) => {
      if (isDiffBackgroundIntensity(value)) next.diffIntensity = value;
    },
  },
  wordEmphasis: {
    normalize: (value, fallback) => coerceSetting(value, fallback, isDiffWordEmphasis),
    update: (next, _current, value) => {
      if (isDiffWordEmphasis(value)) next.wordEmphasis = value;
    },
  },
  toolCallBackground: {
    normalize: coerceToolCallBackgroundMode,
    update: (next, _current, value) => {
      if (isToolCallBackgroundMode(value)) next.toolCallBackground = value;
    },
  },
  toolCallTiming: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.toolCallTiming = value === "on";
    },
  },
  readCollapsedLines: {
    normalize: coerceNumber,
    update: (next, current, value) => {
      next.readCollapsedLines = coerceStringNumber(value, current.readCollapsedLines);
    },
  },
  readContentPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.readContentPreview = value === "on";
    },
  },
  writeContentPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.writeContentPreview = value === "on";
    },
  },
  writeCollapsedLines: {
    normalize: coerceNumber,
    update: (next, current, value) => {
      next.writeCollapsedLines = coerceStringNumber(value, current.writeCollapsedLines);
    },
  },
  editDiffPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.editDiffPreview = value === "on";
    },
  },
  editCollapsedLines: {
    normalize: coerceEditPreviewLines,
    update: (next, current, value) => {
      next.editCollapsedLines =
        value === "all"
          ? "all"
          : coerceStringNumber(
              value,
              typeof current.editCollapsedLines === "number" ? current.editCollapsedLines : 100,
            );
    },
  },
  grepCollapsedLines: {
    normalize: coerceNumber,
    update: (next, current, value) => {
      next.grepCollapsedLines = coerceStringNumber(value, current.grepCollapsedLines);
    },
  },
  grepResultPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.grepResultPreview = value === "on";
    },
  },
  findResultPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.findResultPreview = value === "on";
    },
  },
  lsResultPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.lsResultPreview = value === "on";
    },
  },
  pathListCollapsedLines: {
    normalize: coerceNumber,
    update: (next, current, value) => {
      next.pathListCollapsedLines = coerceStringNumber(value, current.pathListCollapsedLines);
    },
  },
  readLineNumbers: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.readLineNumbers = value === "on";
    },
  },
  bashResultPreview: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.bashResultPreview = value === "on";
    },
  },
  bashWarnings: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.bashWarnings = value === "on";
    },
  },
  syntaxHighlighting: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.syntaxHighlighting = value === "on";
    },
  },
  secretWarnings: {
    normalize: coerceBoolean,
    update: (next, _current, value) => {
      next.secretWarnings = value === "on";
    },
  },
  pathIcons: {
    normalize: (value, fallback) => coerceSetting(value, fallback, isPathIconMode),
    update: (next, _current, value) => {
      if (isPathIconMode(value)) next.pathIcons = value;
    },
  },
  tools: {
    normalize: coerceTools,
    update: (next, current, value) => {
      next.tools = coerceTools(value, current.tools);
    },
  },
} as const satisfies CodePreviewSettingDescriptors;

export const CODE_PREVIEW_SETTING_KEYS = Object.keys(
  CODE_PREVIEW_SETTING_DEFINITIONS,
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
  const next = {} as CodePreviewSettings;
  for (const key of CODE_PREVIEW_SETTING_KEYS) normalizeSetting(next, data, fallback, key);
  return withRequiredToolRenderers(next);
}

function normalizeSetting<K extends keyof CodePreviewSettings>(
  next: CodePreviewSettings,
  data: unknown,
  fallback: CodePreviewSettings,
  key: K,
): void {
  const definition = CODE_PREVIEW_SETTING_DEFINITIONS[
    key
  ] as unknown as CodePreviewSettingDescriptor<K>;
  next[key] = definition.normalize(getObjectValue(data, key), fallback[key]);
}

export function updateSetting(
  current: CodePreviewSettings,
  id: string,
  value: string,
): CodePreviewSettings {
  if (id === "resetToDefaults" && value === "reset now")
    return cloneCodePreviewSettings(defaultCodePreviewSettings);

  const next = cloneCodePreviewSettings(current);
  const definition = getSettingDefinition(id);
  if (definition) definition.update(next, current, value);
  else if (id.startsWith("tool:")) next.tools = updateToolToggle(current.tools, id, value);
  return withRequiredToolRenderers(next);
}

function getSettingDefinition(
  id: string,
): CodePreviewSettingDescriptor<keyof CodePreviewSettings> | undefined {
  return Object.hasOwn(CODE_PREVIEW_SETTING_DEFINITIONS, id)
    ? CODE_PREVIEW_SETTING_DEFINITIONS[id as keyof CodePreviewSettings]
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

function coerceSetting<T>(value: unknown, fallback: T, isValid: (value: unknown) => value is T): T {
  return isValid(value) ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function withRequiredToolRenderers(settings: CodePreviewSettings): CodePreviewSettings {
  return {
    ...settings,
    tools: getEffectiveCodePreviewTools(settings.tools, settings),
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
