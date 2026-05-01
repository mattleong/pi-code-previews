import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import {
  formatEnabledCodePreviewTools,
  getEnabledCodePreviewTools,
} from "../src/tool-selection.ts";

let previousCodePreviewTools: string | undefined;

beforeEach(() => {
  previousCodePreviewTools = process.env.CODE_PREVIEW_TOOLS;
});

afterEach(() => {
  if (previousCodePreviewTools === undefined) delete process.env.CODE_PREVIEW_TOOLS;
  else process.env.CODE_PREVIEW_TOOLS = previousCodePreviewTools;
});

test("CODE_PREVIEW_TOOLS selects enabled renderers", () => {
  process.env.CODE_PREVIEW_TOOLS = "write,edit,grep";
  assert.deepEqual([...getEnabledCodePreviewTools()], ["write", "edit", "grep"]);
  assert.equal(formatEnabledCodePreviewTools(), "write, edit, grep");
});
