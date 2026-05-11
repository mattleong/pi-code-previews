import assert from "node:assert/strict";
import { test } from "vitest";
import { trimSingleTrailingNewline } from "./format";
import { countContentLines, countPreviewTextLines } from "./line-counts";

test("trimSingleTrailingNewline preserves leading and meaningful trailing spaces", () => {
  assert.equal(trimSingleTrailingNewline("  indented\n"), "  indented");
  assert.equal(trimSingleTrailingNewline("   \n"), "   ");
  assert.equal(trimSingleTrailingNewline("line\r\n"), "line");
  assert.equal(trimSingleTrailingNewline("line\n\n"), "line\n");
});

test("line counters preserve file and preview trailing-blank semantics", () => {
  assert.equal(countContentLines("\n\n"), 2);
  assert.equal(countContentLines("one\n"), 1);
  assert.equal(countPreviewTextLines("\n\n"), 0);
  assert.equal(countPreviewTextLines("one\n\ntwo"), 3);
});
