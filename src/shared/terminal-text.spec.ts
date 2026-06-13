import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import { escapeControlChars, injectVisibleRanges, wrapAnsiToWidth } from "./terminal-text";
import { stripAnsi } from "../testing/render";

test("control escaping neutralizes C1 terminal controls", () => {
  assert.equal(escapeControlChars("ok \u009b31mred"), "ok �31mred");
  assert.equal(escapeControlChars("title\u009dafter"), "title�after");
});

test("visible-range injection preserves SGR foreground resets", () => {
  const highlighted = injectVisibleRanges("ab\x1b[31mc\x1b[39mde", [[1, 4]], {
    open: "<open>",
    close: "<close>",
    reopenAfterSgr: (sequence) => sequence === "\x1b[39m",
  });
  assert.equal(highlighted, "a<open>b\x1b[31mc\x1b[39m<open>d<close>e");
});

test("ANSI wrapping uses terminal cell width for wide unicode", () => {
  const rows = wrapAnsiToWidth(`\x1b[31m${"漢".repeat(8)}\x1b[39m`, 6, 10);
  assert.ok(rows.length > 1);
  assert.ok(rows.every((row) => visibleWidth(row) <= 6));
  assert.equal(stripAnsi(rows[0] ?? ""), "漢漢漢");
});
