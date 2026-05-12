import assert from "node:assert/strict";
import { test } from "vitest";
import { createSimpleDiff } from "./structured";

test("createSimpleDiff keeps separated changes distinct", () => {
  const diff = createSimpleDiff("a\nold one\nkeep\nold two\nz", "a\nnew one\nkeep\nnew two\nz");
  assert.match(diff, /-2 old one/);
  assert.match(diff, /\+2 new one/);
  assert.match(diff, / 3 keep/);
  assert.match(diff, /-4 old two/);
  assert.match(diff, /\+4 new two/);
  assert.doesNotMatch(diff, /-3 keep/);
  assert.doesNotMatch(diff, /\+3 keep/);
});
