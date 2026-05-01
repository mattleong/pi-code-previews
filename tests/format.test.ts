import assert from "node:assert/strict";
import { test } from "vitest";
import { trimSingleTrailingNewline } from "../src/format.ts";

test("trimSingleTrailingNewline preserves leading and meaningful trailing spaces", () => {
  assert.equal(trimSingleTrailingNewline("  indented\n"), "  indented");
  assert.equal(trimSingleTrailingNewline("   \n"), "   ");
  assert.equal(trimSingleTrailingNewline("line\r\n"), "line");
  assert.equal(trimSingleTrailingNewline("line\n\n"), "line\n");
});
