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
type SettingsGroupDefinition = {
  name: string;
  label: string;
  description: string;
  summarize: (settings: CodePreviewSettings) => string;
  items: (
    current: CodePreviewSettings,
    getCurrent: SettingsProvider,
    onSettingChange: SettingChangeHandler,
  ) => SettingItem[];
};

const SETTINGS_CATEGORY_GROUPS: SettingsGroupDefinition[] = [
  {
    name: "appearance",
    label: "Appearance",
    description: "Theme, syntax color, tool frames, timing, line numbers, and path icons.",
    summarize: summarizeAppearance,
    items: (current) => createSettingListItems(current, APPEARANCE_SETTING_IDS),
  },
  {
    name: "outputPreviews",
    label: "Output previews",
    description: "Collapsed output/code visibility and preview lengths by tool family.",
    summarize: summarizeOutputPreviews,
    items: (current, getCurrent, onSettingChange) =>
      createOutputPreviewItems(current, getCurrent, onSettingChange),
  },
  {
    name: "warningsSafety",
    label: "Warnings & safety",
    description: "Preview-only safety warnings for shell commands and secret-looking values.",
    summarize: summarizeWarnings,
    items: (current) => createSettingListItems(current, WARNING_SETTING_IDS),
  },
  {
    name: "advanced",
    label: "Advanced",
    description: "Settings file location and restore defaults.",
    summarize: () => "file & defaults",
    items: (current) => createSettingListItems(current, ADVANCED_SETTING_IDS),
  },
];

export function createSettingsCategoryItems(
  current: CodePreviewSettings,
  getCurrent: SettingsProvider,
  onSettingChange: SettingChangeHandler,
): SettingItem[] {
  const groupItem = (name: string) =>
    createSettingsGroupItemFromDefinition(
      settingsGroupDefinition(name),
      current,
      getCurrent,
      onSettingChange,
    );
  return [
    groupItem("appearance"),
    groupItem("outputPreviews"),
    {
      id: "tools",
      label: "Enabled tools",
      description:
        "Toggle tool previews individually. Changes take effect after /reload. Tools already owned by another extension are skipped automatically.",
      currentValue: summarizeTools(current),
      submenu: (_currentValue, done) =>
        new ToolPreviewSettingsSubmenu(formatSettingValue(getCurrent(), "tools"), done),
    },
    groupItem("warningsSafety"),
    groupItem("advanced"),
  ];
}

function settingsGroupDefinition(name: string): SettingsGroupDefinition {
  const definition = SETTINGS_CATEGORY_GROUPS.find((group) => group.name === name);
  if (definition === undefined) throw new RangeError(`Missing settings group ${name}`);
  return definition;
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

function createSettingsGroupItemFromDefinition(
  definition: SettingsGroupDefinition,
  current: CodePreviewSettings,
  getCurrent: SettingsProvider,
  onSettingChange: SettingChangeHandler,
): SettingItem {
  return createSettingsGroupItem({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    currentValue: definition.summarize(current),
    onSettingChange,
    items: () => definition.items(getCurrent(), getCurrent, onSettingChange),
    summary: () => definition.summarize(getCurrent()),
  });
}

export function isSettingsGroupItemId(id: string): boolean {
  return id.startsWith(SETTINGS_GROUP_ID_PREFIX);
}

const OUTPUT_PREVIEW_GROUPS: SettingsGroupDefinition[] = [
  {
    name: "readPreviews",
    label: "Read previews",
    description: "File content visibility and collapsed read size.",
    summarize: summarizeReadPreviews,
    items: (current) => createSettingListItems(current, READ_PREVIEW_SETTING_IDS),
  },
  {
    name: "writePreviews",
    label: "Write previews",
    description: "Write content/diff visibility and collapsed write content size.",
    summarize: summarizeWritePreviews,
    items: (current) => createSettingListItems(current, WRITE_PREVIEW_SETTING_IDS),
  },
  {
    name: "diffPreviews",
    label: "Edit diff previews",
    description: "Edit diff visibility, backgrounds, word emphasis, and collapsed size.",
    summarize: summarizeDiffPreviews,
    items: (current) => createSettingListItems(current, DIFF_PREVIEW_SETTING_IDS),
  },
  {
    name: "searchListPreviews",
    label: "Search/list previews",
    description: "Grep, find, and ls result visibility plus collapsed sizes.",
    summarize: summarizeSearchListPreviews,
    items: (current) => createSettingListItems(current, SEARCH_LIST_PREVIEW_SETTING_IDS),
  },
  {
    name: "bashPreviews",
    label: "Bash previews",
    description: "Successful bash output visibility.",
    summarize: summarizeBashPreviews,
    items: (current) => createSettingListItems(current, BASH_PREVIEW_SETTING_IDS),
  },
];

function createOutputPreviewItems(
  current: CodePreviewSettings,
  getCurrent: SettingsProvider,
  onSettingChange: SettingChangeHandler,
): SettingItem[] {
  return OUTPUT_PREVIEW_GROUPS.map((group) =>
    createSettingsGroupItemFromDefinition(group, current, getCurrent, onSettingChange),
  );
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
  return item;
}

function groupId(name: string): string {
  return `${SETTINGS_GROUP_ID_PREFIX}${name}`;
}
