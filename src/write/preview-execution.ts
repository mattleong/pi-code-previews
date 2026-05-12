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

function executeWriteWithPreviewLock(
  path: string,
  content: string,
  cwd: string,
  absolutePath: string,
  signal: AbortSignal | undefined,
) {
  return new Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: CodePreviewBeforeWriteDetails;
  }>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Operation aborted"));
      return;
    }
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      reject(new Error("Operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    (async () => {
      try {
        const before = await readExistingFileForPreview(path, cwd, content);
        if (aborted) return;
        await mkdir(dirname(absolutePath), { recursive: true });
        if (aborted) return;
        await writeFile(absolutePath, content, "utf-8");
        if (aborted) return;
        signal?.removeEventListener("abort", onAbort);
        resolve({
          content: [
            { type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` },
          ],
          details: { codePreviewBeforeWrite: before },
        });
      } catch (error) {
        signal?.removeEventListener("abort", onAbort);
        if (!aborted) reject(error);
      }
    })();
  });
}

export function withCodePreviewBeforeWrite<T extends { details?: unknown }>(
  result: T,
  before: CodePreviewBeforeWrite,
): T & { details: Record<string, unknown> } {
  const details = result.details && typeof result.details === "object" ? result.details : {};
  return { ...result, details: { ...details, [CODE_PREVIEW_BEFORE_WRITE_DETAIL]: before } };
}
