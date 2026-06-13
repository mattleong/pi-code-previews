import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { test, vi } from "vitest";
import { resolvePreviewPath } from "../paths/resolve";
import { readExistingFileForPreview } from "./diff";
import { executeWriteWithPreview } from "./preview-execution";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("./diff", () => ({
  readExistingFileForPreview: vi.fn(),
}));

test("aborted writes keep the file mutation queue locked until in-flight writes settle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-code-previews-write-abort-"));
  try {
    let resolveWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      resolveWriteStarted = resolve;
    });

    let resolveReleaseWrite!: () => void;
    const releaseWrite = new Promise<void>((resolve) => {
      resolveReleaseWrite = resolve;
    });

    vi.mocked(writeFile).mockImplementation(async () => {
      resolveWriteStarted();
      await releaseWrite;
    });
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(readExistingFileForPreview).mockResolvedValue({
      kind: "content",
      content: "before",
    });

    const controller = new AbortController();
    const firstPromise = executeWriteWithPreview("target.txt", "after", dir, controller.signal);

    await writeStarted;
    controller.abort();

    let secondAcquired = false;
    const secondMutation = withFileMutationQueue(
      resolvePreviewPath("target.txt", dir),
      async () => {
        secondAcquired = true;
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(secondAcquired, false);

    resolveReleaseWrite();
    await assert.rejects(firstPromise, { message: "Operation aborted" });
    await secondMutation;
    assert.equal(secondAcquired, true);

    assert.equal(vi.mocked(mkdir).mock.calls.length, 1);
    assert.equal(vi.mocked(writeFile).mock.calls.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
