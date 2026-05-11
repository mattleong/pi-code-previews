import { type SettingItem } from "@earendil-works/pi-tui";
import { getSettingsPath } from "../store";
import { formatSettingValue, type CodePreviewSettings } from "../index";
import { SettingsGroupSubmenu, ThemeSelectSubmenu, ToolPreviewSettingsSubmenu } from "./submenus";
import {
  ADVANCED_SETTING_IDS,
  APPEARANCE_SETTING_IDS,
  BASH_PREVIEW_SETTING_IDS,
  DIFF_PREVIEW_SETTING_IDS,
  READ_PREVIEW_SETTING_IDS,
  SEARCH_LIST_PREVIEW_SETTING_IDS,
  SETTING_ITEM_DEFINITIONS,
  SETTINGS_GROUP_ID_PREFIX,
  WARNING_SETTING_IDS,
  WRITE_PREVIEW_SETTING_IDS,
  type SettingItemDefinition,
  type SettingsUiItemId,
} from "./registry";
import {
  summarizeAppearance,
  summarizeBashPreviews,
  summarizeDiffPreviews,
  summarizeOutputPreviews,
  summarizeReadPreviews,
  summarizeSearchListPreviews,
  summarizeTools,
  summarizeWarnings,
  summarizeWritePreviews,
} from "./summaries";

type SettingsProvider = () => CodePreviewSettings;
type SettingChangeHandler = (id: string, value: string) => void;

export function createSettingsCategoryItems(
  current: CodePreviewSettings,
  getCurrent: SettingsProvider,
  onSettingChange: SettingChangeHandler,
): SettingItem[] {
  return [
    createSettingsGroupItem({
      name: "appearance",
      label: "Appearance",
      description: "Theme, syntax color, tool frames, timing, line numbers, and path icons.",
      currentValue: summarizeAppearance(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), APPEARANCE_SETTING_IDS),
      summary: () => summarizeAppearance(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "outputPreviews",
      label: "Output previews",
      description: "Collapsed output/code visibility and preview lengths by tool family.",
      currentValue: summarizeOutputPreviews(current),
      onSettingChange,
      items: () => createOutputPreviewItems(getCurrent(), getCurrent, onSettingChange),
      summary: () => summarizeOutputPreviews(getCurrent()),
    }),
    {
      id: "tools",
      label: "Enabled tools",
      description:
        "Toggle tool previews individually. Changes take effect after /reload. Tools already owned by another extension are skipped automatically.",
      currentValue: summarizeTools(current),
      submenu: (_currentValue, done) =>
        new ToolPreviewSettingsSubmenu(formatSettingValue(getCurrent(), "tools"), done),
    },
    createSettingsGroupItem({
      name: "warningsSafety",
      label: "Warnings & safety",
      description: "Preview-only safety warnings for shell commands and secret-looking values.",
      currentValue: summarizeWarnings(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), WARNING_SETTING_IDS),
      summary: () => summarizeWarnings(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "advanced",
      label: "Advanced",
      description: "Settings file location and restore defaults.",
      currentValue: "file & defaults",
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), ADVANCED_SETTING_IDS),
      summary: () => "file & defaults",
    }),
  ];
}

type SettingsGroupItemOptions = {
  name: string;
  label: string;
  description: string;
  currentValue: string;
  onSettingChange: SettingChangeHandler;
  items: () => SettingItem[];
  summary: () => string;
};

function createSettingsGroupItem(options: SettingsGroupItemOptions): SettingItem {
  return {
    id: groupId(options.name),
    label: options.label,
    description: options.description,
    currentValue: options.currentValue,
    submenu: (_currentValue, done) =>
      new SettingsGroupSubmenu({
        title: options.label,
        description: options.description,
        items: options.items,
        onChange: options.onSettingChange,
        done,
        summary: options.summary,
      }),
  };
}

export function isSettingsGroupItemId(id: string): boolean {
  return id.startsWith(SETTINGS_GROUP_ID_PREFIX);
}

function createOutputPreviewItems(
  current: CodePreviewSettings,
  getCurrent: SettingsProvider,
  onSettingChange: SettingChangeHandler,
): SettingItem[] {
  return [
    createSettingsGroupItem({
      name: "readPreviews",
      label: "Read previews",
      description: "File content visibility and collapsed read size.",
      currentValue: summarizeReadPreviews(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), READ_PREVIEW_SETTING_IDS),
      summary: () => summarizeReadPreviews(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "writePreviews",
      label: "Write previews",
      description: "Write content/diff visibility and collapsed write content size.",
      currentValue: summarizeWritePreviews(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), WRITE_PREVIEW_SETTING_IDS),
      summary: () => summarizeWritePreviews(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "diffPreviews",
      label: "Edit diff previews",
      description: "Edit diff visibility, backgrounds, word emphasis, and collapsed size.",
      currentValue: summarizeDiffPreviews(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), DIFF_PREVIEW_SETTING_IDS),
      summary: () => summarizeDiffPreviews(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "searchListPreviews",
      label: "Search/list previews",
      description: "Grep, find, and ls result visibility plus collapsed sizes.",
      currentValue: summarizeSearchListPreviews(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), SEARCH_LIST_PREVIEW_SETTING_IDS),
      summary: () => summarizeSearchListPreviews(getCurrent()),
    }),
    createSettingsGroupItem({
      name: "bashPreviews",
      label: "Bash previews",
      description: "Successful bash output visibility.",
      currentValue: summarizeBashPreviews(current),
      onSettingChange,
      items: () => createSettingListItems(getCurrent(), BASH_PREVIEW_SETTING_IDS),
      summary: () => summarizeBashPreviews(getCurrent()),
    }),
  ];
}

function createSettingListItems(
  current: CodePreviewSettings,
  ids: readonly SettingsUiItemId[],
): SettingItem[] {
  return ids.map((id) => createSettingItem(current, id));
}

function createSettingItem(current: CodePreviewSettings, id: SettingsUiItemId): SettingItem {
  const definition = SETTING_ITEM_DEFINITIONS[id] as SettingItemDefinition;
  const item: SettingItem = {
    id,
    label: definition.label,
    description: definition.description,
    currentValue: id === "settingsFile" ? getSettingsPath() : formatSettingValue(current, id),
    ...(definition.values ? { values: [...definition.values] } : {}),
  };
  if (id === "shikiTheme")
    item.submenu = (currentValue, done) => new ThemeSelectSubmenu(currentValue, done);
  else if (id === "tools")
    item.submenu = (currentValue, done) => new ToolPreviewSettingsSubmenu(currentValue, done);
  return item;
}

function groupId(name: string): string {
  return `${SETTINGS_GROUP_ID_PREFIX}${name}`;
}
