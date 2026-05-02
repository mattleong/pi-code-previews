import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { defaultCodePreviewSettings } from "../src/settings.ts";
import { extractCodePreviewSettings, getSettingsPath } from "../src/settings-store.ts";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
});

test("getSettingsPath respects PI_CODING_AGENT_DIR", () => {
  process.env.PI_CODING_AGENT_DIR = "/tmp/pi-config";

  assert.equal(getSettingsPath(), join("/tmp/pi-config", "code-previews.json"));
});

test("extractCodePreviewSettings accepts nested, prefixed, and saved raw settings", () => {
  assert.deepEqual(extractCodePreviewSettings({ codePreview: { readCollapsedLines: 20 } }), {
    readCollapsedLines: 20,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadCollapsedLines: 30 }), {
    readCollapsedLines: 30,
  });
  assert.deepEqual(
    extractCodePreviewSettings({
      ...defaultCodePreviewSettings,
      readCollapsedLines: 40,
    }).readCollapsedLines,
    40,
  );
  assert.deepEqual(extractCodePreviewSettings({ theme: "dark" }), {});
});
