import assert from "node:assert/strict";
import { test } from "vitest";
import { createSettingsCategoryItems, isSettingsGroupItemId } from "./index";
import { SETTING_ITEM_DEFINITIONS, type SettingItemDefinition } from "./registry";
import {
  CODE_PREVIEW_SETTING_KEYS,
  codePreviewSettings,
  defaultCodePreviewSettings,
  normalizeSettings,
  setCodePreviewSettings,
  updateSetting,
} from "../index";

test("settings normalization and reset preserve defaults", () => {
  const normalized = normalizeSettings({
    syntaxHighlighting: false,
    secretWarnings: false,
    bashWarnings: false,
    bashResultPreview: false,
    toolCallBackground: false,
    toolCallTiming: false,
    readContentPreview: false,
    writeContentPreview: false,
    editDiffPreview: false,
    grepResultPreview: false,
    findResultPreview: false,
    lsResultPreview: false,
    readCollapsedLines: -1,
    tools: ["bash", "not-a-tool", "write", "bash"],
  });
  assert.equal(normalized.syntaxHighlighting, false);
  assert.equal(normalized.secretWarnings, false);
  assert.equal(normalized.bashWarnings, false);
  assert.equal(normalized.bashResultPreview, false);
  assert.equal(normalized.toolCallBackground, "off");
  assert.equal(normalized.toolCallTiming, false);
  assert.equal(normalized.readContentPreview, false);
  assert.equal(normalized.writeContentPreview, false);
  assert.equal(normalized.editDiffPreview, false);
  assert.equal(normalized.grepResultPreview, false);
  assert.equal(normalized.findResultPreview, false);
  assert.equal(normalized.lsResultPreview, false);
  assert.equal(normalized.wordEmphasis, defaultCodePreviewSettings.wordEmphasis);
  assert.equal(normalized.readCollapsedLines, defaultCodePreviewSettings.readCollapsedLines);
  assert.deepEqual(normalized.tools, ["bash", "read", "write", "edit", "grep", "find", "ls"]);
  assert.deepEqual(
    updateSetting(normalized, "resetToDefaults", "reset now"),
    defaultCodePreviewSettings,
  );
});

test("settings normalization falls back to accumulated settings for invalid overrides", () => {
  const fallback = {
    ...defaultCodePreviewSettings,
    shikiTheme: "github-dark",
    readCollapsedLines: 40,
  };
  const invalidOverride = normalizeSettings(
    { shikiTheme: "not-a-theme", readCollapsedLines: -1 },
    fallback,
  );
  assert.equal(invalidOverride.shikiTheme, "github-dark");
  assert.equal(invalidOverride.readCollapsedLines, 40);

  const validOverride = normalizeSettings(
    { shikiTheme: "dark-plus", readCollapsedLines: 20 },
    fallback,
  );
  assert.equal(validOverride.shikiTheme, "dark-plus");
  assert.equal(validOverride.readCollapsedLines, 20);
  assert.equal(updateSetting(validOverride, "wordEmphasis", "all").wordEmphasis, "all");
  assert.equal(updateSetting(validOverride, "readContentPreview", "off").readContentPreview, false);
  assert.equal(
    updateSetting(validOverride, "writeContentPreview", "off").writeContentPreview,
    false,
  );
  assert.equal(updateSetting(validOverride, "editDiffPreview", "off").editDiffPreview, false);
  assert.equal(updateSetting(validOverride, "grepResultPreview", "off").grepResultPreview, false);
  assert.equal(updateSetting(validOverride, "findResultPreview", "off").findResultPreview, false);
  assert.equal(updateSetting(validOverride, "lsResultPreview", "off").lsResultPreview, false);
  assert.equal(updateSetting(validOverride, "bashResultPreview", "off").bashResultPreview, false);
  assert.equal(updateSetting(validOverride, "toolCallTiming", "off").toolCallTiming, false);
  assert.equal(updateSetting(validOverride, "toolCallBackground", "off").toolCallBackground, "off");
  assert.equal(
    updateSetting(validOverride, "toolCallBackground", "border").toolCallBackground,
    "border",
  );
  assert.equal(normalizeSettings({ wordEmphasis: "off" }, fallback).wordEmphasis, "off");
  assert.equal(
    normalizeSettings({ toolCallBackground: "border" }, fallback).toolCallBackground,
    "border",
  );
  assert.deepEqual(normalizeSettings({ tools: "read,grep" }, fallback).tools, ["read", "grep"]);
});

test("setCodePreviewSettings updates existing settings object references", () => {
  const previous = { ...codePreviewSettings, tools: [...codePreviewSettings.tools] };
  const reference = codePreviewSettings;
  try {
    setCodePreviewSettings({
      ...defaultCodePreviewSettings,
      readCollapsedLines: 33,
      tools: ["bash"],
    });
    assert.equal(reference.readCollapsedLines, 33);
    assert.deepEqual(reference.tools, ["bash"]);
  } finally {
    setCodePreviewSettings(previous);
  }
});

test("disabled preview settings keep corresponding tool renderers enabled", () => {
  const normalized = normalizeSettings(
    {
      readContentPreview: false,
      writeContentPreview: false,
      editDiffPreview: false,
      bashResultPreview: false,
      grepResultPreview: false,
      findResultPreview: false,
      lsResultPreview: false,
      tools: [],
    },
    defaultCodePreviewSettings,
  );
  assert.deepEqual(normalized.tools, ["bash", "read", "write", "edit", "grep", "find", "ls"]);

  const withoutGrep = updateSetting(
    { ...normalized, tools: normalized.tools.filter((tool) => tool !== "grep") },
    "tool:grep",
    "off",
  );
  assert.ok(withoutGrep.tools.includes("grep"));
});

test("individual tool toggles update configured previews", () => {
  const withoutGrep = updateSetting(defaultCodePreviewSettings, "tool:grep", "off");
  assert.deepEqual(
    withoutGrep.tools,
    defaultCodePreviewSettings.tools.filter((tool) => tool !== "grep"),
  );

  const withGrep = updateSetting(withoutGrep, "tool:grep", "on");
  assert.deepEqual(withGrep.tools, defaultCodePreviewSettings.tools);
});

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
