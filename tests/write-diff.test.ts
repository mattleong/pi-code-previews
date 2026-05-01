import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  createSimpleDiff,
  getMaxWriteDiffBytes,
  getWriteDiffSkipReason,
  readExistingFileForPreview,
  resolvePreviewPath,
} from "../src/write-diff.ts";

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

test("resolvePreviewPath preserves @ paths and handles ~ and relative paths", () => {
  assert.equal(resolvePreviewPath("@src/file.ts", "/tmp/project"), "/tmp/project/@src/file.ts");
  assert.equal(resolvePreviewPath("src/file.ts", "/tmp/project"), "/tmp/project/src/file.ts");
  assert.equal(resolvePreviewPath("~/file.ts", "/tmp/project").endsWith("/file.ts"), true);
});

test("readExistingFileForPreview returns bounded previous content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-code-previews-"));
  try {
    await writeFile(join(dir, "small.txt"), "before", "utf8");
    assert.deepEqual(await readExistingFileForPreview("small.txt", dir, "after"), {
      kind: "content",
      content: "before",
    });

    await writeFile(join(dir, "large.txt"), "x".repeat(getMaxWriteDiffBytes() + 1), "utf8");
    const skipped = await readExistingFileForPreview("large.txt", dir, "after");
    assert.equal(skipped?.kind, "skipped");
    assert.match(getWriteDiffSkipReason(skipped, "after") ?? "", /previous file too large/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
