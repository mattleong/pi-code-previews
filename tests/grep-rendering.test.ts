import assert from "node:assert/strict";
import { test } from "vitest";
import { parseGrepOutputLine } from "../src/grep-rendering.ts";

test("parseGrepOutputLine handles hyphenated filenames, context lines, and empty matches", () => {
  assert.deepEqual(parseGrepOutputLine("src/foo-1-bar.ts:42: const x = 1;"), {
    path: "src/foo-1-bar.ts",
    lineNumber: "42",
    code: "const x = 1;",
    kind: "match",
  });
  assert.deepEqual(parseGrepOutputLine("src/foo-1-bar.ts-43- return x;"), {
    path: "src/foo-1-bar.ts",
    lineNumber: "43",
    code: "return x;",
    kind: "context",
  });
  assert.deepEqual(parseGrepOutputLine("src/blank.ts:3: "), {
    path: "src/blank.ts",
    lineNumber: "3",
    code: "",
    kind: "match",
  });
  assert.deepEqual(parseGrepOutputLine("src/blank.ts-4- "), {
    path: "src/blank.ts",
    lineNumber: "4",
    code: "",
    kind: "context",
  });
});
