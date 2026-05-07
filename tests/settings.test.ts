import assert from "node:assert/strict";
import { test } from "vitest";
import {
  codePreviewSettings,
  defaultCodePreviewSettings,
  normalizeSettings,
  setCodePreviewSettings,
  updateSetting,
} from "../src/settings.ts";

test("settings normalization and reset preserve defaults", () => {
  const normalized = normalizeSettings({
    syntaxHighlighting: false,
    secretWarnings: false,
    bashWarnings: false,
    readContentPreview: false,
    readCollapsedLines: -1,
    tools: ["bash", "not-a-tool", "write", "bash"],
  });
  assert.equal(normalized.syntaxHighlighting, false);
  assert.equal(normalized.secretWarnings, false);
  assert.equal(normalized.bashWarnings, false);
  assert.equal(normalized.readContentPreview, false);
  assert.equal(normalized.wordEmphasis, defaultCodePreviewSettings.wordEmphasis);
  assert.equal(normalized.readCollapsedLines, defaultCodePreviewSettings.readCollapsedLines);
  assert.deepEqual(normalized.tools, ["bash", "write"]);
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
  assert.equal(normalizeSettings({ wordEmphasis: "off" }, fallback).wordEmphasis, "off");
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

test("individual tool toggles update configured previews", () => {
  const withoutGrep = updateSetting(defaultCodePreviewSettings, "tool:grep", "off");
  assert.deepEqual(
    withoutGrep.tools,
    defaultCodePreviewSettings.tools.filter((tool) => tool !== "grep"),
  );

  const withGrep = updateSetting(withoutGrep, "tool:grep", "on");
  assert.deepEqual(withGrep.tools, defaultCodePreviewSettings.tools);
});
