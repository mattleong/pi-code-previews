import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { resolvePreviewPath } from "../paths/resolve";
import { getObjectValue } from "../shared/objects";
import { readExistingFileForPreview, type ExistingFilePreview } from "./diff";

const CODE_PREVIEW_BEFORE_WRITE_DETAIL = "codePreviewBeforeWrite";

export type CodePreviewBeforeWrite = ExistingFilePreview | undefined;

export type CodePreviewBeforeWriteDetails = {
  codePreviewBeforeWrite: CodePreviewBeforeWrite;
};

export function getCodePreviewBeforeWrite(details: unknown): unknown {
  return getObjectValue(details, CODE_PREVIEW_BEFORE_WRITE_DETAIL);
}

export async function executeWriteWithPreview(
  path: string,
  content: string,
  cwd: string,
  signal: AbortSignal | undefined,
) {
  const absolutePath = resolvePreviewPath(path, cwd);
  return withFileMutationQueue(absolutePath, () =>
    executeWriteWithPreviewLock(path, content, cwd, absolutePath, signal),
  );
}

function throwIfAborted(signal: AbortSignal | undefined, aborted: boolean): void {
  if (aborted || signal?.aborted) throw new Error("Operation aborted");
}

async function executeWriteWithPreviewLock(
  path: string,
  content: string,
  cwd: string,
  absolutePath: string,
  signal: AbortSignal | undefined,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details: CodePreviewBeforeWriteDetails;
}> {
  if (signal?.aborted) throw new Error("Operation aborted");
  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const before = await readExistingFileForPreview(path, cwd, content);
    throwIfAborted(signal, aborted);
    await mkdir(dirname(absolutePath), { recursive: true });
    throwIfAborted(signal, aborted);
    await writeFile(absolutePath, content, "utf-8");
    throwIfAborted(signal, aborted);
    return {
      content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
      details: { codePreviewBeforeWrite: before },
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export function withCodePreviewBeforeWrite<T extends { details?: unknown }>(
  result: T,
  before: CodePreviewBeforeWrite,
): T & { details: Record<string, unknown> } {
  const details = result.details && typeof result.details === "object" ? result.details : {};
  return { ...result, details: { ...details, [CODE_PREVIEW_BEFORE_WRITE_DETAIL]: before } };
}
