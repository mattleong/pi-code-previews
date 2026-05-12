import type { CodePreviewToolName } from "../tools/names";

export const DIFF_BACKGROUND_INTENSITIES = ["off", "subtle", "medium"] as const;
export type DiffBackgroundIntensity = (typeof DIFF_BACKGROUND_INTENSITIES)[number];

export const DIFF_WORD_EMPHASES = ["all", "smart", "off"] as const;
export type DiffWordEmphasis = (typeof DIFF_WORD_EMPHASES)[number];

export const TOOL_CALL_BACKGROUND_MODES = ["on", "border", "off"] as const;
export type ToolCallBackgroundMode = (typeof TOOL_CALL_BACKGROUND_MODES)[number];

export const PATH_ICON_MODES = ["unicode", "nerd", "off"] as const;
export type PathIconMode = (typeof PATH_ICON_MODES)[number];

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

export type CodePreviewEditableSettingId = keyof CodePreviewSettings | "resetToDefaults";
