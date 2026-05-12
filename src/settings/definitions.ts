import { bundledThemes } from "shiki";
import { parsePositiveInteger } from "../config/env";
import {
  isCodePreviewToolName,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "../tools/names";
import {
  DIFF_BACKGROUND_INTENSITIES,
  DIFF_WORD_EMPHASES,
  PATH_ICON_MODES,
  type CodePreviewSettings,
  type DiffBackgroundIntensity,
  type DiffWordEmphasis,
  type PathIconMode,
  type ToolCallBackgroundMode,
} from "./types";
import { isToolCallBackgroundMode, parseToolCallBackgroundMode } from "./tool-call-background";

export type CodePreviewSettingDescriptor<K extends keyof CodePreviewSettings> = {
  normalize(value: unknown, fallback: CodePreviewSettings[K]): CodePreviewSettings[K];
  update(next: CodePreviewSettings, current: CodePreviewSettings, value: string): void;
};

type CodePreviewSettingDescriptors = {
  [K in keyof CodePreviewSettings]: CodePreviewSettingDescriptor<K>;
};

type BooleanSettingKey = {
  [K in keyof CodePreviewSettings]: CodePreviewSettings[K] extends boolean ? K : never;
}[keyof CodePreviewSettings];

type NumberSettingKey = {
  [K in keyof CodePreviewSettings]: CodePreviewSettings[K] extends number ? K : never;
}[keyof CodePreviewSettings];

function validatedSetting<K extends keyof CodePreviewSettings>(
  key: K,
  isValid: (value: unknown) => value is CodePreviewSettings[K],
): CodePreviewSettingDescriptor<K> {
  return {
    normalize: (value, fallback) => coerceSetting(value, fallback, isValid),
    update: (next, _current, value) => {
      if (isValid(value)) next[key] = value;
    },
  };
}

function booleanSetting<K extends BooleanSettingKey>(key: K): CodePreviewSettingDescriptor<K> {
  return {
    normalize: coerceBoolean as CodePreviewSettingDescriptor<K>["normalize"],
    update: (next, _current, value) => {
      next[key] = (value === "on") as CodePreviewSettings[K];
    },
  };
}

function positiveIntegerSetting<K extends NumberSettingKey>(
  key: K,
): CodePreviewSettingDescriptor<K> {
  return {
    normalize: coerceNumber as CodePreviewSettingDescriptor<K>["normalize"],
    update: (next, current, value) => {
      next[key] = coerceStringNumber(value, current[key] as number) as CodePreviewSettings[K];
    },
  };
}

export const CODE_PREVIEW_SETTING_DEFINITIONS = {
  shikiTheme: validatedSetting("shikiTheme", isBundledThemeName),
  diffIntensity: validatedSetting("diffIntensity", isDiffBackgroundIntensity),
  wordEmphasis: validatedSetting("wordEmphasis", isDiffWordEmphasis),
  toolCallBackground: {
    normalize: coerceToolCallBackgroundMode,
    update: (next, _current, value) => {
      if (isToolCallBackgroundMode(value)) next.toolCallBackground = value;
    },
  },
  toolCallTiming: booleanSetting("toolCallTiming"),
  readCollapsedLines: positiveIntegerSetting("readCollapsedLines"),
  readContentPreview: booleanSetting("readContentPreview"),
  writeContentPreview: booleanSetting("writeContentPreview"),
  writeCollapsedLines: positiveIntegerSetting("writeCollapsedLines"),
  editDiffPreview: booleanSetting("editDiffPreview"),
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
  grepCollapsedLines: positiveIntegerSetting("grepCollapsedLines"),
  grepResultPreview: booleanSetting("grepResultPreview"),
  findResultPreview: booleanSetting("findResultPreview"),
  lsResultPreview: booleanSetting("lsResultPreview"),
  pathListCollapsedLines: positiveIntegerSetting("pathListCollapsedLines"),
  readLineNumbers: booleanSetting("readLineNumbers"),
  bashResultPreview: booleanSetting("bashResultPreview"),
  bashWarnings: booleanSetting("bashWarnings"),
  syntaxHighlighting: booleanSetting("syntaxHighlighting"),
  secretWarnings: booleanSetting("secretWarnings"),
  pathIcons: validatedSetting("pathIcons", isPathIconMode),
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

export function getSettingDefinition(
  id: string,
): CodePreviewSettingDescriptor<keyof CodePreviewSettings> | undefined {
  return Object.hasOwn(CODE_PREVIEW_SETTING_DEFINITIONS, id)
    ? CODE_PREVIEW_SETTING_DEFINITIONS[id as keyof CodePreviewSettings]
    : undefined;
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
  return parseToolCallBackgroundMode(value) ?? fallback;
}

function coerceTools(value: unknown, fallback: CodePreviewToolName[]): CodePreviewToolName[] {
  if (typeof value === "string") return [...(parseCodePreviewTools(value) ?? fallback)];
  if (!Array.isArray(value)) return fallback;
  const tools = value.filter(
    (tool): tool is CodePreviewToolName => typeof tool === "string" && isCodePreviewToolName(tool),
  );
  return [...new Set(tools)];
}

export function isDiffBackgroundIntensity(value: unknown): value is DiffBackgroundIntensity {
  return isStringOption(DIFF_BACKGROUND_INTENSITIES, value);
}

export function isDiffWordEmphasis(value: unknown): value is DiffWordEmphasis {
  return isStringOption(DIFF_WORD_EMPHASES, value);
}

export function isPathIconMode(value: unknown): value is PathIconMode {
  return isStringOption(PATH_ICON_MODES, value);
}

function isStringOption<const T extends readonly string[]>(
  options: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export function isBundledThemeName(value: unknown): value is string {
  return typeof value === "string" && value in bundledThemes;
}
