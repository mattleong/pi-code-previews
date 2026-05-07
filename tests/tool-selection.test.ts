import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import {
  defaultCodePreviewSettings,
  setCodePreviewSettings,
  codePreviewSettings,
} from "../src/settings.ts";
import {
  formatEnabledCodePreviewTools,
  getEnabledCodePreviewTools,
} from "../src/tool-selection.ts";

let previousCodePreviewSettings = { ...codePreviewSettings };
let previousCodePreviewTools: string | undefined;

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
  previousCodePreviewTools = process.env.CODE_PREVIEW_TOOLS;
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
  if (previousCodePreviewTools === undefined) delete process.env.CODE_PREVIEW_TOOLS;
  else process.env.CODE_PREVIEW_TOOLS = previousCodePreviewTools;
});

test("CODE_PREVIEW_TOOLS selects enabled renderers", () => {
  process.env.CODE_PREVIEW_TOOLS = "write,edit,grep";
  assert.deepEqual([...getEnabledCodePreviewTools()], ["write", "edit", "grep"]);
  assert.equal(formatEnabledCodePreviewTools(), "write, edit, grep");
});

test("settings select enabled renderers when CODE_PREVIEW_TOOLS is unset", () => {
  delete process.env.CODE_PREVIEW_TOOLS;
  setCodePreviewSettings({ ...defaultCodePreviewSettings, tools: ["bash", "write", "edit"] });
  assert.deepEqual([...getEnabledCodePreviewTools()], ["bash", "write", "edit"]);
  assert.equal(formatEnabledCodePreviewTools(), "bash, write, edit");
});

test("CODE_PREVIEW_TOOLS overrides configured renderer settings", () => {
  setCodePreviewSettings({ ...defaultCodePreviewSettings, tools: ["bash", "write", "edit"] });
  process.env.CODE_PREVIEW_TOOLS = "grep";
  assert.deepEqual([...getEnabledCodePreviewTools()], ["grep"]);
});

test("disabled result previews force required renderers even with CODE_PREVIEW_TOOLS", () => {
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    grepResultPreview: false,
    findResultPreview: false,
    lsResultPreview: false,
    tools: [],
  });
  process.env.CODE_PREVIEW_TOOLS = "none";
  assert.deepEqual([...getEnabledCodePreviewTools()], ["grep", "find", "ls", "bash"]);
});
