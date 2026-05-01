import assert from "node:assert/strict";
import { test } from "vitest";
import { resolvePreviewLanguage } from "../src/language.ts";

test("resolvePreviewLanguage handles filenames, shebangs, and conservative content", () => {
  assert.equal(resolvePreviewLanguage({ path: ".env.local" }), "dotenv");
  assert.equal(resolvePreviewLanguage({ path: "Dockerfile.dev" }), "dockerfile");
  assert.equal(resolvePreviewLanguage({ path: "Makefile" }), "makefile");
  assert.equal(
    resolvePreviewLanguage({ path: "script", content: "#!/usr/bin/env python3\nprint('hi')" }),
    "python",
  );
  assert.equal(resolvePreviewLanguage({ path: "data", content: '{"ok":true}' }), "json");
  assert.equal(resolvePreviewLanguage({ path: "unknown", content: "hello world" }), undefined);
});
