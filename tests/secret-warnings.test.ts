import assert from "node:assert/strict";
import { test } from "vitest";
import { getSecretWarnings } from "../src/secret-warnings.ts";

test("getSecretWarnings detects common secret-looking values", () => {
  assert.deepEqual(getSecretWarnings("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz"), ["API key"]);
  assert.deepEqual(getSecretWarnings('OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"'), [
    "API key",
  ]);
  assert.deepEqual(getSecretWarnings("token=ghp_abcdefghijklmnopqrstuvwxyz123456"), [
    "GitHub token",
  ]);
  assert.deepEqual(getSecretWarnings("hello world"), []);
});
