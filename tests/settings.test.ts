import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultCodePreviewSettings, normalizeSettings, updateSetting } from "../src/settings.ts";

test("settings normalization and reset preserve defaults", () => {
  const normalized = normalizeSettings({
    syntaxHighlighting: false,
    secretWarnings: false,
    bashWarnings: false,
    readCollapsedLines: -1,
  });
  assert.equal(normalized.syntaxHighlighting, false);
  assert.equal(normalized.secretWarnings, false);
  assert.equal(normalized.bashWarnings, false);
  assert.equal(normalized.wordEmphasis, defaultCodePreviewSettings.wordEmphasis);
  assert.equal(normalized.readCollapsedLines, defaultCodePreviewSettings.readCollapsedLines);
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
  assert.equal(normalizeSettings({ wordEmphasis: "off" }, fallback).wordEmphasis, "off");
});
