import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  getMaxWriteDiffBytes,
  getWriteDiffSkipReason,
  readExistingFileForPreview,
  resolvePreviewPath,
} from "./diff";

test("resolvePreviewPath mirrors pi path expansion", () => {
  assert.equal(resolvePreviewPath("@src/file.ts", "/tmp/project"), "/tmp/project/src/file.ts");
  assert.equal(resolvePreviewPath("src/file.ts", "/tmp/project"), "/tmp/project/src/file.ts");
  assert.equal(resolvePreviewPath("@~/file.ts", "/tmp/project").endsWith("/file.ts"), true);
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
