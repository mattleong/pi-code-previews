import assert from "node:assert/strict";
import { test } from "vitest";
import { getBashWarnings } from "../src/bash-warnings.ts";

test("getBashWarnings returns user-facing labels", () => {
  assert.deepEqual(getBashWarnings("sudo rm -rf build"), [
    "recursive delete",
    "elevated privileges",
  ]);
  assert.deepEqual(getBashWarnings("rm -r -f build"), ["recursive delete"]);
  assert.deepEqual(getBashWarnings("rm -Rf build"), ["recursive delete"]);
  assert.deepEqual(getBashWarnings("git reset --hard && git clean -fd"), [
    "discards git changes",
    "removes untracked files",
  ]);
  assert.deepEqual(getBashWarnings("echo hi"), []);
});
