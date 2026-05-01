import assert from "node:assert/strict";
import { visibleWidth } from "@mariozechner/pi-tui";
import { test } from "vitest";
import { wrapAnsiToWidth } from "../src/terminal-text.ts";
import { stripAnsi } from "./test-utils.ts";

test("ANSI wrapping uses terminal cell width for wide unicode", () => {
  const rows = wrapAnsiToWidth(`\x1b[31m${"漢".repeat(8)}\x1b[39m`, 6, 10);
  assert.ok(rows.length > 1);
  assert.ok(rows.every((row) => visibleWidth(row) <= 6));
  assert.equal(stripAnsi(rows[0] ?? ""), "漢漢漢");
});
