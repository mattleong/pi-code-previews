import { bundledThemes } from "shiki";
import { getObjectValue } from "./data.ts";
import {
  ALL_CODE_PREVIEW_TOOLS,
  isCodePreviewToolName,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "./tool-names.ts";

export type DiffBackgroundIntensity = "off" | "subtle" | "medium";
export type DiffWordEmphasis = "off" | "smart" | "all";
export type PathIconMode = "off" | "unicode" | "nerd";

export interface CodePreviewSettings {
  shikiTheme: string;
  diffIntensity: DiffBackgroundIntensity;
  wordEmphasis: DiffWordEmphasis;
  readCollapsedLines: number;
  readContentPreview: boolean;
  writeCollapsedLines: number;
  editCollapsedLines: number | "all";
  grepCollapsedLines: number;
  pathListCollapsedLines: number;
  readLineNumbers: boolean;
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
  readCollapsedLines: envNumber("CODE_PREVIEW_READ_LINES", 10),
  readContentPreview: envBoolean("CODE_PREVIEW_READ_CONTENT", true),
  writeCollapsedLines: envNumber("CODE_PREVIEW_WRITE_LINES", 10),
  editCollapsedLines: envEditLines("CODE_PREVIEW_EDIT_LINES", 160),
  grepCollapsedLines: envNumber("CODE_PREVIEW_GREP_LINES", 15),
  pathListCollapsedLines: envNumber("CODE_PREVIEW_PATH_LIST_LINES", 20),
  readLineNumbers: envBoolean("CODE_PREVIEW_READ_LINE_NUMBERS", true),
  bashWarnings: envBoolean("CODE_PREVIEW_BASH_WARNINGS", true),
  syntaxHighlighting: envBoolean("CODE_PREVIEW_SYNTAX", true),
  secretWarnings: envBoolean("CODE_PREVIEW_SECRET_WARNINGS", true),
  pathIcons: envPathIconMode("CODE_PREVIEW_PATH_ICONS", "unicode"),
  tools: [...ALL_CODE_PREVIEW_TOOLS],
};

export const codePreviewSettings: CodePreviewSettings = cloneCodePreviewSettings(
  defaultCodePreviewSettings,
);

export function setCodePreviewSettings(next: CodePreviewSettings) {
  Object.assign(codePreviewSettings, cloneCodePreviewSettings(next));
}

function cloneCodePreviewSettings(settings: CodePreviewSettings): CodePreviewSettings {
  return { ...settings, tools: [...settings.tools] };
}

export function normalizeSettings(
  data: unknown,
  fallback: CodePreviewSettings = codePreviewSettings,
): CodePreviewSettings {
  const shikiTheme = getObjectValue(data, "shikiTheme");
  const diffIntensity = getObjectValue(data, "diffIntensity");
  const wordEmphasis = getObjectValue(data, "wordEmphasis");
  const readContentPreview = getObjectValue(data, "readContentPreview");
  const readLineNumbers = getObjectValue(data, "readLineNumbers");
  const bashWarnings = getObjectValue(data, "bashWarnings");
  const syntaxHighlighting = getObjectValue(data, "syntaxHighlighting");
  const secretWarnings = getObjectValue(data, "secretWarnings");
  const pathIcons = getObjectValue(data, "pathIcons");
  return {
    shikiTheme: isBundledThemeName(shikiTheme) ? shikiTheme : fallback.shikiTheme,
    diffIntensity: isDiffBackgroundIntensity(diffIntensity)
      ? diffIntensity
      : fallback.diffIntensity,
    wordEmphasis: isDiffWordEmphasis(wordEmphasis) ? wordEmphasis : fallback.wordEmphasis,
    readCollapsedLines: coerceNumber(
      getObjectValue(data, "readCollapsedLines"),
      fallback.readCollapsedLines,
    ),
    readContentPreview:
      typeof readContentPreview === "boolean" ? readContentPreview : fallback.readContentPreview,
    writeCollapsedLines: coerceNumber(
      getObjectValue(data, "writeCollapsedLines"),
      fallback.writeCollapsedLines,
    ),
    editCollapsedLines: coerceEditPreviewLines(
      getObjectValue(data, "editCollapsedLines"),
      fallback.editCollapsedLines,
    ),
    grepCollapsedLines: coerceNumber(
      getObjectValue(data, "grepCollapsedLines"),
      fallback.grepCollapsedLines,
    ),
    pathListCollapsedLines: coerceNumber(
      getObjectValue(data, "pathListCollapsedLines"),
      fallback.pathListCollapsedLines,
    ),
    readLineNumbers:
      typeof readLineNumbers === "boolean" ? readLineNumbers : fallback.readLineNumbers,
    bashWarnings: typeof bashWarnings === "boolean" ? bashWarnings : fallback.bashWarnings,
    syntaxHighlighting:
      typeof syntaxHighlighting === "boolean" ? syntaxHighlighting : fallback.syntaxHighlighting,
    secretWarnings: typeof secretWarnings === "boolean" ? secretWarnings : fallback.secretWarnings,
    pathIcons: isPathIconMode(pathIcons) ? pathIcons : fallback.pathIcons,
    tools: coerceTools(getObjectValue(data, "tools"), fallback.tools),
  };
}

export function updateSetting(
  current: CodePreviewSettings,
  id: string,
  value: string,
): CodePreviewSettings {
  const next = { ...current };
  if (id === "shikiTheme" && isBundledThemeName(value)) next.shikiTheme = value;
  else if (id === "diffIntensity" && isDiffBackgroundIntensity(value)) next.diffIntensity = value;
  else if (id === "wordEmphasis" && isDiffWordEmphasis(value)) next.wordEmphasis = value;
  else if (id === "readCollapsedLines")
    next.readCollapsedLines = coerceStringNumber(value, current.readCollapsedLines);
  else if (id === "readContentPreview") next.readContentPreview = value === "on";
  else if (id === "writeCollapsedLines")
    next.writeCollapsedLines = coerceStringNumber(value, current.writeCollapsedLines);
  else if (id === "editCollapsedLines")
    next.editCollapsedLines =
      value === "all"
        ? "all"
        : coerceStringNumber(
            value,
            typeof current.editCollapsedLines === "number" ? current.editCollapsedLines : 100,
          );
  else if (id === "grepCollapsedLines")
    next.grepCollapsedLines = coerceStringNumber(value, current.grepCollapsedLines);
  else if (id === "pathListCollapsedLines")
    next.pathListCollapsedLines = coerceStringNumber(value, current.pathListCollapsedLines);
  else if (id === "readLineNumbers") next.readLineNumbers = value === "on";
  else if (id === "bashWarnings") next.bashWarnings = value === "on";
  else if (id === "syntaxHighlighting") next.syntaxHighlighting = value === "on";
  else if (id === "secretWarnings") next.secretWarnings = value === "on";
  else if (id === "pathIcons" && isPathIconMode(value)) next.pathIcons = value;
  else if (id === "tools") next.tools = coerceTools(value, current.tools);
  else if (id.startsWith("tool:")) next.tools = updateToolToggle(current.tools, id, value);
  else if (id === "resetToDefaults" && value === "reset now")
    return { ...defaultCodePreviewSettings };
  return next;
}

function envTheme(name: string, fallback: string): string {
  const value = process.env[name];
  return isBundledThemeName(value) ? value : fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.toLowerCase();
  if (value === undefined) return fallback;
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function envEditLines(name: string, fallback: number | "all"): number | "all" {
  const value = process.env[name];
  if (value === "all") return "all";
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
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
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function coerceEditPreviewLines(value: unknown, fallback: number | "all"): number | "all" {
  if (value === "all") return "all";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
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

function isPathIconMode(value: unknown): value is PathIconMode {
  return value === "off" || value === "unicode" || value === "nerd";
}

function isBundledThemeName(value: unknown): value is string {
  return typeof value === "string" && value in bundledThemes;
}
