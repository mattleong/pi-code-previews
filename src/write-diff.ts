import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { diffLines } from "diff";
import { formatBytes } from "./format.js";

export type StructuredDiffLine = { kind: "context" | "add" | "remove" | "separator"; oldLine?: number; newLine?: number; content: string };
export interface StructuredDiffHunk { header: string; lines: StructuredDiffLine[] }

export type ExistingFilePreview =
	| { kind: "content"; content: string }
	| { kind: "skipped"; reason: string; byteLength?: number; maxBytes: number };

const MAX_WRITE_DIFF_BYTES = envPositiveInteger("CODE_PREVIEW_MAX_WRITE_DIFF_BYTES", 200000);

export async function readExistingFileForPreview(path: string, cwd: string, nextContent = ""): Promise<ExistingFilePreview | undefined> {
	if (!path) return undefined;
	const resolved = resolvePreviewPath(path, cwd);
	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(resolved);
	} catch (error) {
		return isFileNotFound(error) ? undefined : skippedExistingFile("previous content unavailable", undefined);
	}

	if (!fileStat.isFile()) return skippedExistingFile("previous path is not a regular file", fileStat.size);
	if (fileStat.size > MAX_WRITE_DIFF_BYTES) return skippedExistingFile("previous file too large", fileStat.size);

	const nextBytes = Buffer.byteLength(nextContent, "utf8");
	if (nextBytes > MAX_WRITE_DIFF_BYTES) return skippedExistingFile("new content too large", nextBytes);

	try {
		const content = await readFile(resolved, "utf8");
		const bytes = Buffer.byteLength(content, "utf8");
		if (bytes > MAX_WRITE_DIFF_BYTES) return skippedExistingFile("previous file too large", bytes);
		return { kind: "content", content };
	} catch {
		return skippedExistingFile("previous content unavailable", fileStat.size);
	}
}

export function getWriteDiffSkipReason(before: unknown, nextContent: string): string | undefined {
	if (!before || typeof before !== "object") return undefined;
	if (shouldSkipWriteDiffText(nextContent)) return formatSkipReason("new content too large", Buffer.byteLength(nextContent, "utf8"));
	const record = before as Record<string, unknown>;
	if (record.kind !== "skipped") return undefined;
	const reason = typeof record.reason === "string" ? record.reason : "preview unavailable";
	const byteLength = typeof record.byteLength === "number" ? record.byteLength : undefined;
	const maxBytes = typeof record.maxBytes === "number" ? record.maxBytes : MAX_WRITE_DIFF_BYTES;
	return formatSkipReason(reason, byteLength, maxBytes);
}

export function shouldSkipWriteDiffText(text: string): boolean {
	return Buffer.byteLength(text, "utf8") > MAX_WRITE_DIFF_BYTES;
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
	let expanded = path.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
	if (expanded === "~") expanded = homedir();
	else if (expanded.startsWith("~/")) expanded = `${homedir()}${expanded.slice(1)}`;
	return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function createSimpleDiff(before: string, after: string): string {
	return formatStructuredDiff(createStructuredDiff(before, after));
}

export function createStructuredDiff(before: string, after: string): StructuredDiffHunk[] {
	const changes = diffLines(before, after);
	const hasChangeAfter = changes.map(() => false);
	let futureChangeSeen = false;
	for (let index = changes.length - 1; index >= 0; index--) {
		hasChangeAfter[index] = futureChangeSeen;
		const change = changes[index]!;
		if (change.added || change.removed) futureChangeSeen = true;
	}

	const lines: StructuredDiffLine[] = [];
	let oldLine = 1;
	let newLine = 1;
	const context = 3;
	let emittedChange = false;
	let firstChangeLine = 1;

	for (let index = 0; index < changes.length; index++) {
		const change = changes[index]!;
		const chunkLines = splitDiffLines(change.value);

		if (!change.added && !change.removed) {
			const hasFutureChange = hasChangeAfter[index] ?? false;
			if (!emittedChange && hasFutureChange) {
				const start = Math.max(0, chunkLines.length - context);
				for (let offset = start; offset < chunkLines.length; offset++) lines.push({ kind: "context", oldLine: oldLine + offset, newLine: newLine + offset, content: chunkLines[offset] ?? "" });
			} else if (emittedChange) {
				lines.push(...(hasFutureChange ? compactContextLines(chunkLines, oldLine, newLine, context) : chunkLines.slice(0, context).map((line, offset) => ({ kind: "context" as const, oldLine: oldLine + offset, newLine: newLine + offset, content: line }))));
			}
			oldLine += chunkLines.length;
			newLine += chunkLines.length;
			continue;
		}

		if (!emittedChange) firstChangeLine = newLine;
		emittedChange = true;
		for (const line of chunkLines) {
			if (change.removed) lines.push({ kind: "remove", oldLine: oldLine++, content: line });
			else if (change.added) lines.push({ kind: "add", newLine: newLine++, content: line });
		}
	}

	return lines.length ? [{ header: `@@ ${firstChangeLine} @@`, lines }] : [];
}

function skippedExistingFile(reason: string, byteLength: number | undefined): ExistingFilePreview {
	return { kind: "skipped", reason, byteLength, maxBytes: MAX_WRITE_DIFF_BYTES };
}

function formatSkipReason(reason: string, byteLength: number | undefined, maxBytes = MAX_WRITE_DIFF_BYTES): string {
	if (byteLength === undefined) return reason;
	return `${reason} (${formatBytes(byteLength)} > ${formatBytes(maxBytes)})`;
}

function formatStructuredDiff(hunks: StructuredDiffHunk[]): string {
	return hunks.flatMap((hunk) => [hunk.header, ...hunk.lines.map(formatStructuredLine)]).join("\n");
}

function formatStructuredLine(line: StructuredDiffLine): string {
	if (line.kind === "separator") return "...";
	if (line.kind === "add") return `+${line.newLine ?? ""} ${line.content}`;
	if (line.kind === "remove") return `-${line.oldLine ?? ""} ${line.content}`;
	return ` ${line.newLine ?? line.oldLine ?? ""} ${line.content}`;
}

function splitDiffLines(value: string): string[] {
	const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function compactContextLines(lines: string[], oldFirstLine: number, newFirstLine: number, context: number): StructuredDiffLine[] {
	if (lines.length <= context * 2) return lines.map((line, offset) => ({ kind: "context", oldLine: oldFirstLine + offset, newLine: newFirstLine + offset, content: line }));
	return [
		...lines.slice(0, context).map((line, offset) => ({ kind: "context" as const, oldLine: oldFirstLine + offset, newLine: newFirstLine + offset, content: line })),
		{ kind: "separator", content: "..." } satisfies StructuredDiffLine,
		...lines.slice(-context).map((line, offset) => ({ kind: "context" as const, oldLine: oldFirstLine + lines.length - context + offset, newLine: newFirstLine + lines.length - context + offset, content: line })),
	];
}

function envPositiveInteger(name: string, fallback: number): number {
	const value = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
