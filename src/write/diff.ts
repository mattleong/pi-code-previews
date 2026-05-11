import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { positiveEnvInteger } from "../config/env";
import { formatBytes } from "../shared/format";
import { isFileNotFound } from "../shared/errors";

export type ExistingFilePreview =
  | { kind: "content"; content: string }
  | {
      kind: "skipped";
      reason: string;
      byteLength?: number;
      maxBytes: number;
      sizeExceeded?: boolean;
    };

const MAX_WRITE_DIFF_BYTES = positiveEnvInteger("CODE_PREVIEW_MAX_WRITE_DIFF_BYTES", 200000);

export async function readExistingFileForPreview(
  path: string,
  cwd: string,
  nextContent = "",
): Promise<ExistingFilePreview | undefined> {
  if (!path) return undefined;
  const resolved = resolvePreviewPath(path, cwd);
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(resolved);
  } catch (error) {
    return isFileNotFound(error)
      ? undefined
      : skippedExistingFile("previous content unavailable", undefined);
  }

  if (!fileStat.isFile())
    return skippedExistingFile("previous path is not a regular file", fileStat.size);
  if (fileStat.size > MAX_WRITE_DIFF_BYTES)
    return skippedExistingFile("previous file too large", fileStat.size, true);

  const nextBytes = Buffer.byteLength(nextContent, "utf8");
  if (nextBytes > MAX_WRITE_DIFF_BYTES)
    return skippedExistingFile("new content too large", nextBytes, true);

  try {
    const content = await readFile(resolved, "utf8");
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_WRITE_DIFF_BYTES)
      return skippedExistingFile("previous file too large", bytes, true);
    return { kind: "content", content };
  } catch {
    return skippedExistingFile("previous content unavailable", fileStat.size);
  }
}

export function getWriteDiffSkipReason(before: unknown, nextContent: string): string | undefined {
  if (!before || typeof before !== "object") return undefined;
  const nextBytes = Buffer.byteLength(nextContent, "utf8");
  if (nextBytes > MAX_WRITE_DIFF_BYTES)
    return formatSkipReason("new content too large", nextBytes, true);
  const record = before as Record<string, unknown>;
  if (record.kind !== "skipped") return undefined;
  const reason = typeof record.reason === "string" ? record.reason : "preview unavailable";
  const byteLength = typeof record.byteLength === "number" ? record.byteLength : undefined;
  const maxBytes = typeof record.maxBytes === "number" ? record.maxBytes : MAX_WRITE_DIFF_BYTES;
  const sizeExceeded = record.sizeExceeded === true;
  return formatSkipReason(reason, byteLength, sizeExceeded, maxBytes);
}

export function shouldSkipWriteDiffBytes(...texts: string[]): boolean {
  let total = 0;
  for (const text of texts) {
    total += Buffer.byteLength(text, "utf8");
    if (total > MAX_WRITE_DIFF_BYTES) return true;
  }
  return false;
}

export function getMaxWriteDiffBytes(): number {
  return MAX_WRITE_DIFF_BYTES;
}

export function resolvePreviewPath(path: string, cwd: string): string {
  let expanded = path.startsWith("@") ? path.slice(1) : path;
  expanded = expanded.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  if (expanded === "~") expanded = homedir();
  else if (expanded.startsWith("~/")) expanded = `${homedir()}${expanded.slice(1)}`;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function skippedExistingFile(
  reason: string,
  byteLength: number | undefined,
  sizeExceeded = false,
): ExistingFilePreview {
  return { kind: "skipped", reason, byteLength, maxBytes: MAX_WRITE_DIFF_BYTES, sizeExceeded };
}

function formatSkipReason(
  reason: string,
  byteLength: number | undefined,
  sizeExceeded: boolean,
  maxBytes = MAX_WRITE_DIFF_BYTES,
): string {
  if (byteLength === undefined) return reason;
  if (!sizeExceeded) return `${reason} (${formatBytes(byteLength)})`;
  return `${reason} (${formatBytes(byteLength)} > ${formatBytes(maxBytes)})`;
}
