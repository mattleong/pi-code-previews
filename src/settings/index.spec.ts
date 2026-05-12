import assert from "node:assert/strict";
import { test } from "vitest";
import {
  codePreviewSettings,
  defaultCodePreviewSettings,
  normalizeSettings,
  setCodePreviewSettings,
  updateSetting,
} from "./index";

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
