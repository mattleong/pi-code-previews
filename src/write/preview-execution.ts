import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { resolvePreviewPath } from "../paths/resolve";
import { getObjectValue } from "../shared/objects";
import { readExistingFileForPreview, type ExistingFilePreview } from "./diff";

const CODE_PREVIEW_BEFORE_WRITE_DETAIL = "codePreviewBeforeWrite";
const MAX_BEFORE_WRITE_CACHE_ENTRIES = 64;

export type CodePreviewBeforeWrite = ExistingFilePreview | undefined;

type RedactedCodePreviewBeforeWrite =
  | Exclude<ExistingFilePreview, { kind: "content" }>
  | { kind: "content"; byteLength: number }
  | undefined;

export type CodePreviewBeforeWriteDetails = {
  codePreviewBeforeWrite: RedactedCodePreviewBeforeWrite;
};

const beforeWriteCache = new Map<string, CodePreviewBeforeWrite>();

export function getCodePreviewBeforeWrite(
  toolCallId: string | undefined,
  details: unknown,
): unknown {
  if (toolCallId && beforeWriteCache.has(toolCallId)) return beforeWriteCache.get(toolCallId);
  return getObjectValue(details, CODE_PREVIEW_BEFORE_WRITE_DETAIL);
}

export async function executeWriteWithPreview(
  toolCallId: string,
  path: string,
  content: string,
  cwd: string,
  signal: AbortSignal | undefined,
) {
  const absolutePath = resolvePreviewPath(path, cwd);
  return withFileMutationQueue(absolutePath, () =>
    executeWriteWithPreviewLock(toolCallId, path, content, cwd, absolutePath, signal),
  );
}

function rememberCodePreviewBeforeWrite(toolCallId: string, before: CodePreviewBeforeWrite): void {
  beforeWriteCache.delete(toolCallId);
  if (before !== undefined) beforeWriteCache.set(toolCallId, before);
  while (beforeWriteCache.size > MAX_BEFORE_WRITE_CACHE_ENTRIES) {
    const oldest = beforeWriteCache.keys().next().value;
    if (oldest === undefined) break;
    beforeWriteCache.delete(oldest);
  }
}

function redactedBeforeWriteDetail(before: CodePreviewBeforeWrite): RedactedCodePreviewBeforeWrite {
  if (!before || before.kind !== "content") return before;
  return { kind: "content", byteLength: Buffer.byteLength(before.content, "utf8") };
}

function throwIfAborted(signal: AbortSignal | undefined, aborted: boolean): void {
  if (aborted || signal?.aborted) throw new Error("Operation aborted");
}

async function executeWriteWithPreviewLock(
  toolCallId: string,
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
    rememberCodePreviewBeforeWrite(toolCallId, before);
    return {
      content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
      details: { codePreviewBeforeWrite: redactedBeforeWriteDetail(before) },
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
  return {
    ...result,
    details: { ...details, [CODE_PREVIEW_BEFORE_WRITE_DETAIL]: redactedBeforeWriteDetail(before) },
  };
}
