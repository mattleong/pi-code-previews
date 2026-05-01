import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultCodePreviewSettings } from "../src/settings.ts";
import { extractCodePreviewSettings } from "../src/settings-store.ts";

test("extractCodePreviewSettings accepts nested, prefixed, and saved raw settings", () => {
  assert.deepEqual(extractCodePreviewSettings({ codePreview: { readCollapsedLines: 20 } }), {
    readCollapsedLines: 20,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadCollapsedLines: 30 }), {
    readCollapsedLines: 30,
  });
  assert.deepEqual(
    extractCodePreviewSettings({ ...defaultCodePreviewSettings, readCollapsedLines: 40 })
      .readCollapsedLines,
    40,
  );
  assert.deepEqual(extractCodePreviewSettings({ theme: "dark" }), {});
});
