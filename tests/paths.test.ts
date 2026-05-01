import assert from "node:assert/strict";
import { test } from "vitest";
import { formatDisplayPath } from "../src/paths.ts";

test("formatDisplayPath shortens paths relative to cwd", () => {
  assert.equal(formatDisplayPath("/tmp/project/src/file.ts", "/tmp/project"), "src/file.ts");
  assert.equal(formatDisplayPath("src/file.ts", "/tmp/project"), "src/file.ts");
});
