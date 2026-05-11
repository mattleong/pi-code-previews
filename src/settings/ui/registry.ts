import type { CodePreviewEditableSettingId } from "../index";

export type SettingsUiItemId = CodePreviewEditableSettingId | "settingsFile";

export type CodePreviewSettingValueOptions = readonly [string, ...string[]];

export interface SettingItemDefinition {
  label: string;
  description: string;
  values?: CodePreviewSettingValueOptions;
}

export const SETTINGS_GROUP_ID_PREFIX = "group:";

export const APPEARANCE_SETTING_IDS = [
  "shikiTheme",
  "syntaxHighlighting",
  "toolCallBackground",
  "toolCallTiming",
  "readLineNumbers",
  "pathIcons",
] as const satisfies readonly SettingsUiItemId[];

export const DIFF_PREVIEW_SETTING_IDS = [
  "diffIntensity",
  "wordEmphasis",
  "editDiffPreview",
  "editCollapsedLines",
] as const satisfies readonly SettingsUiItemId[];

export const READ_PREVIEW_SETTING_IDS = [
  "readContentPreview",
  "readCollapsedLines",
] as const satisfies readonly SettingsUiItemId[];

export const WRITE_PREVIEW_SETTING_IDS = [
  "writeContentPreview",
  "writeCollapsedLines",
] as const satisfies readonly SettingsUiItemId[];

export const SEARCH_LIST_PREVIEW_SETTING_IDS = [
  "grepResultPreview",
  "grepCollapsedLines",
  "findResultPreview",
  "lsResultPreview",
  "pathListCollapsedLines",
] as const satisfies readonly SettingsUiItemId[];

export const BASH_PREVIEW_SETTING_IDS = [
  "bashResultPreview",
] as const satisfies readonly SettingsUiItemId[];

export const WARNING_SETTING_IDS = [
  "bashWarnings",
  "secretWarnings",
] as const satisfies readonly SettingsUiItemId[];

export const ADVANCED_SETTING_IDS = [
  "settingsFile",
  "resetToDefaults",
] as const satisfies readonly SettingsUiItemId[];

const CODE_PREVIEW_SETTING_ITEM_DEFINITIONS = {
  shikiTheme: {
    label: "Syntax theme",
    description: "Theme used for Shiki syntax highlighting in code previews.",
  },
  diffIntensity: {
    label: "Diff background",
    description: "Background intensity for added and removed edit diff lines.",
    values: ["off", "subtle", "medium"],
  },
  wordEmphasis: {
    label: "Word-level diff emphasis",
    description:
      "Highlight changed words inside edit diffs. All mode is the default; smart suppresses low-signal punctuation and wrapper syntax.",
    values: ["all", "smart", "off"],
  },
  toolCallBackground: {
    label: "Tool call background",
    description:
      "Choose Pi's default colored background, no frame, or a border-only frame. Changes take effect after /reload.",
    values: ["on", "border", "off"],
  },
  toolCallTiming: {
    label: "Tool call timing",
    description:
      "Show each tool's elapsed duration in the result footer, or in the top-right border when border mode is enabled.",
    values: ["on", "off"],
  },
  readCollapsedLines: {
    label: "Read preview lines",
    description: "Maximum read result lines shown before collapsing.",
    values: ["10", "20", "40", "80"],
  },
  readContentPreview: {
    label: "Read content preview",
    description:
      "Show file contents in read results. Turn off to hide collapsed output while still allowing expanded output.",
    values: ["on", "off"],
  },
  writeContentPreview: {
    label: "Write code preview",
    description:
      "Show write content and write diffs. Turn off to hide collapsed code previews while still allowing expanded output.",
    values: ["on", "off"],
  },
  writeCollapsedLines: {
    label: "Write preview lines",
    description: "Maximum write content lines shown before collapsing.",
    values: ["10", "20", "40", "80"],
  },
  editDiffPreview: {
    label: "Edit diff preview",
    description:
      "Show proposed and applied edit diffs. Turn off to hide collapsed diff previews while still allowing expanded output.",
    values: ["on", "off"],
  },
  editCollapsedLines: {
    label: "Edit diff preview lines",
    description:
      "Maximum edit diff lines shown before collapsing. `all` matches pi's built-in edit diff behavior.",
    values: ["all", "60", "100", "160", "240"],
  },
  grepCollapsedLines: {
    label: "Grep preview lines",
    description: "Maximum grep result lines shown before collapsing.",
    values: ["10", "15", "25", "40", "80"],
  },
  grepResultPreview: {
    label: "Grep result preview",
    description:
      "Show grep matches in tool results. Turn off to hide collapsed output while still allowing expanded output.",
    values: ["on", "off"],
  },
  findResultPreview: {
    label: "Find result preview",
    description:
      "Show find paths in tool results. Turn off to hide collapsed output while still allowing expanded output.",
    values: ["on", "off"],
  },
  lsResultPreview: {
    label: "Ls result preview",
    description:
      "Show ls entries in tool results. Turn off to hide collapsed output while still allowing expanded output.",
    values: ["on", "off"],
  },
  pathListCollapsedLines: {
    label: "Find/ls preview lines",
    description: "Maximum find and ls result lines shown before collapsing.",
    values: ["10", "20", "40", "80", "120"],
  },
  readLineNumbers: {
    label: "Read line numbers",
    description: "Show line numbers in read previews.",
    values: ["on", "off"],
  },
  bashResultPreview: {
    label: "Bash result preview",
    description:
      "Show successful bash output. Turn off to hide collapsed output while still allowing expanded output, running state, and errors.",
    values: ["on", "off"],
  },
  bashWarnings: {
    label: "Bash visual warnings",
    description: "Show preview-only warnings for potentially destructive shell commands.",
    values: ["on", "off"],
  },
  syntaxHighlighting: {
    label: "Syntax highlighting",
    description:
      "Use Shiki token colors in code previews. Turn off for plainer, lower-noise previews.",
    values: ["on", "off"],
  },
  secretWarnings: {
    label: "Secret value warnings",
    description:
      "Show preview-only warnings when read, write, or bash output looks like it may contain secrets.",
    values: ["on", "off"],
  },
  pathIcons: {
    label: "Find/ls path icons",
    description: "Choose icons for find and ls path-list previews. Nerd mode requires a Nerd Font.",
    values: ["unicode", "nerd", "off"],
  },
  tools: {
    label: "Preview tools",
    description:
      "Open granular tool preview toggles. Changes take effect after /reload. Tools already owned by another extension are skipped automatically.",
  },
} as const satisfies Record<
  Exclude<CodePreviewEditableSettingId, "resetToDefaults">,
  SettingItemDefinition
>;

export const SETTING_ITEM_DEFINITIONS = {
  ...CODE_PREVIEW_SETTING_ITEM_DEFINITIONS,
  settingsFile: {
    label: "Settings file",
    description: "Settings are stored globally in this file.",
  },
  resetToDefaults: {
    label: "Restore defaults",
    description: "Restore the default code preview settings.",
    values: ["keep current", "reset now"],
  },
} as const satisfies Record<SettingsUiItemId, SettingItemDefinition>;
