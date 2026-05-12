import assert from "node:assert/strict";
import { test } from "vitest";
import { formatDisplayPath } from "./display";

test("formatDisplayPath shortens paths relative to cwd", () => {
  assert.equal(formatDisplayPath("/tmp/project/src/file.ts", "/tmp/project"), "src/file.ts");
  assert.equal(formatDisplayPath("src/file.ts", "/tmp/project"), "src/file.ts");
});

test("formatDisplayPath treats dot-prefixed child names as inside cwd", () => {
  assert.equal(formatDisplayPath("/tmp/project/..foo/file.ts", "/tmp/project"), "..foo/file.ts");
  assert.equal(
    formatDisplayPath("/tmp/project/../sibling/file.ts", "/tmp/project"),
    "/tmp/project/../sibling/file.ts",
  );
});
