import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { defaultCodePreviewSettings } from "../src/settings.ts";
import {
  extractCodePreviewSettings,
  getSettingsPath,
  loadSettingsFromDisk,
  saveSettingsToDisk,
} from "../src/settings-store.ts";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
});

test("getSettingsPath uses Pi's agent directory resolution", () => {
  process.env.PI_CODING_AGENT_DIR = join("~", ".config", "pi");

  assert.equal(getSettingsPath(), join(homedir(), ".config", "pi", "code-previews.json"));
});

test("saveSettingsToDisk and loadSettingsFromDisk respect PI_CODING_AGENT_DIR", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "pi-code-previews-settings-"));
  process.env.PI_CODING_AGENT_DIR = configDir;

  await saveSettingsToDisk({ ...defaultCodePreviewSettings, readCollapsedLines: 37 });

  const saved = JSON.parse(await readFile(join(configDir, "code-previews.json"), "utf8"));
  assert.equal(saved.readCollapsedLines, 37);

  const loaded = await loadSettingsFromDisk();
  assert.equal(loaded?.readCollapsedLines, 37);
});

test("extractCodePreviewSettings accepts nested, prefixed, and saved raw settings", () => {
  assert.deepEqual(extractCodePreviewSettings({ codePreview: { readCollapsedLines: 20 } }), {
    readCollapsedLines: 20,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadCollapsedLines: 30 }), {
    readCollapsedLines: 30,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadContentPreview: false }), {
    readContentPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewGrepResultPreview: false }), {
    grepResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewFindResultPreview: false }), {
    findResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewLsResultPreview: false }), {
    lsResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewTools: ["bash", "write"] }), {
    tools: ["bash", "write"],
  });
  assert.deepEqual(
    extractCodePreviewSettings({ ...defaultCodePreviewSettings, readCollapsedLines: 40 })
      .readCollapsedLines,
    40,
  );
  assert.deepEqual(extractCodePreviewSettings({ theme: "dark" }), {});
});
