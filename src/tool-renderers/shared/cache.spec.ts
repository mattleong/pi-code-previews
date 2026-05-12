import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import {
  diffPreviewCacheKey,
  previewCacheKey,
  writeCallPreviewCacheKey,
} from "./preview-cache-key";
import { codePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import { cloneCodePreviewSettingsForTest, testTheme } from "../../testing/render";

let previousCodePreviewSettings = cloneCodePreviewSettingsForTest();

beforeEach(() => {
  previousCodePreviewSettings = cloneCodePreviewSettingsForTest();
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("preview cache keys include word emphasis settings", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  const allKey = previewCacheKey("edit-result", "-1 old\n+1 new", "src/a.ts", false, testTheme());

  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "off" });
  const offKey = previewCacheKey("edit-result", "-1 old\n+1 new", "src/a.ts", false, testTheme());

  assert.notEqual(allKey, offKey);
});

test("diff preview cache keys include syntax highlighter status", () => {
  const diffKey = diffPreviewCacheKey(
    "edit-result",
    "-1 old\n+1 new",
    "src/a.ts",
    false,
    testTheme(),
  );

  assert.match(diffKey, /shiki-(ready|loading)/);
});

test("write call cache keys include write-specific preview settings", () => {
  setCodePreviewSettings({ ...codePreviewSettings, writeCollapsedLines: 20 });
  const shortKey = writeCallPreviewCacheKey("const value = 1;", "src/a.ts", false, testTheme());

  setCodePreviewSettings({ ...codePreviewSettings, writeCollapsedLines: 40 });
  const longKey = writeCallPreviewCacheKey("const value = 1;", "src/a.ts", false, testTheme());

  assert.notEqual(shortKey, longKey);
});
