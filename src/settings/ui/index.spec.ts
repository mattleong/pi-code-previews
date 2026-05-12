import assert from "node:assert/strict";
import { test } from "vitest";
import { createSettingsCategoryItems, isSettingsGroupItemId } from "./index";
import { SETTING_ITEM_DEFINITIONS, type SettingItemDefinition } from "./registry";
import { CODE_PREVIEW_SETTING_KEYS, defaultCodePreviewSettings, updateSetting } from "../index";

test("settings registry defines every setting item", () => {
  for (const [id, definition] of Object.entries(SETTING_ITEM_DEFINITIONS) as Array<
    [string, SettingItemDefinition]
  >) {
    assert.ok(definition.label.trim(), `${id} has a label`);
    assert.ok(definition.description.trim(), `${id} has a description`);
    if (definition.values) assert.ok(definition.values.length > 0, `${id} has value options`);
  }
});

test("settings UI item values are handled by updateSetting", () => {
  assert.deepEqual(
    Object.keys(SETTING_ITEM_DEFINITIONS)
      .filter((id) => id !== "settingsFile")
      .sort(),
    [...CODE_PREVIEW_SETTING_KEYS, "resetToDefaults"].sort(),
  );

  assert.equal(
    updateSetting(defaultCodePreviewSettings, "shikiTheme", "github-dark").shikiTheme,
    "github-dark",
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "diffIntensity", "medium").diffIntensity,
    "medium",
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "wordEmphasis", "smart").wordEmphasis,
    "smart",
  );
  assert.deepEqual(updateSetting(defaultCodePreviewSettings, "tools", "none").tools, []);
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "toolCallBackground", "off").toolCallBackground,
    "off",
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "toolCallBackground", "border").toolCallBackground,
    "border",
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "toolCallTiming", "off").toolCallTiming,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "readContentPreview", "off").readContentPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "readCollapsedLines", "20").readCollapsedLines,
    20,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "writeContentPreview", "off").writeContentPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "writeCollapsedLines", "20").writeCollapsedLines,
    20,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "editDiffPreview", "off").editDiffPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "editCollapsedLines", "all").editCollapsedLines,
    "all",
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "grepResultPreview", "off").grepResultPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "grepCollapsedLines", "25").grepCollapsedLines,
    25,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "findResultPreview", "off").findResultPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "lsResultPreview", "off").lsResultPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "pathListCollapsedLines", "40")
      .pathListCollapsedLines,
    40,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "readLineNumbers", "off").readLineNumbers,
    false,
  );
  assert.equal(updateSetting(defaultCodePreviewSettings, "pathIcons", "off").pathIcons, "off");
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "bashResultPreview", "off").bashResultPreview,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "bashWarnings", "off").bashWarnings,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "syntaxHighlighting", "off").syntaxHighlighting,
    false,
  );
  assert.equal(
    updateSetting(defaultCodePreviewSettings, "secretWarnings", "off").secretWarnings,
    false,
  );
  assert.deepEqual(
    updateSetting(
      { ...defaultCodePreviewSettings, readCollapsedLines: 21 },
      "resetToDefaults",
      "reset now",
    ),
    defaultCodePreviewSettings,
  );
});

test("settings panel categories keep the top level compact", () => {
  const items = createSettingsCategoryItems(
    defaultCodePreviewSettings,
    () => defaultCodePreviewSettings,
    () => undefined,
  );
  assert.deepEqual(
    items.map((item) => item.label),
    ["Appearance", "Output previews", "Enabled tools", "Warnings & safety", "Advanced"],
  );
  assert.equal(items.filter((item) => isSettingsGroupItemId(item.id)).length, 4);
  assert.equal(items.find((item) => item.id === "tools")?.currentValue, "all tools");
});

test("empty tool selections stay explicit in the settings UI", () => {
  const current = { ...defaultCodePreviewSettings, tools: [] };
  const items = createSettingsCategoryItems(
    current,
    () => current,
    () => undefined,
  );
  assert.equal(items.find((item) => item.id === "tools")?.currentValue, "none");
  assert.deepEqual(updateSetting(defaultCodePreviewSettings, "tools", "none").tools, []);
});

test("invalid setting updates preserve current values", () => {
  const current = {
    ...defaultCodePreviewSettings,
    diffIntensity: "medium" as const,
    pathIcons: "nerd" as const,
    readCollapsedLines: 33,
  };
  assert.equal(updateSetting(current, "diffIntensity", "loud").diffIntensity, "medium");
  assert.equal(updateSetting(current, "pathIcons", "emoji").pathIcons, "nerd");
  assert.equal(updateSetting(current, "readCollapsedLines", "nope").readCollapsedLines, 33);
});
