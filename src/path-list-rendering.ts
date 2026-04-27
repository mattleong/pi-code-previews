import type { Theme } from "@mariozechner/pi-coding-agent";
import { renderDisplayPath } from "./paths.js";

export function renderPathListLines(output: string, cwd: string, theme: Theme): string[] {
	const lines = output.split("\n");
	const pathLines = lines.filter((line) => line && !(line.startsWith("[") && line.endsWith("]")));
	const shouldTree = pathLines.some((line) => line.includes("/"));
	if (!shouldTree) return lines.map((line) => renderPathListLine(line, cwd, theme));

	const rendered: string[] = [];
	const seenDirs = new Set<string>();
	for (const line of lines) {
		if (!line) {
			rendered.push("");
			continue;
		}
		if (line.startsWith("[") && line.endsWith("]")) {
			rendered.push(theme.fg("warning", line));
			continue;
		}
		renderTreePath(line, theme, seenDirs, rendered);
	}
	return rendered;
}

function renderTreePath(path: string, theme: Theme, seenDirs: Set<string>, rendered: string[]): void {
	const clean = path.replace(/^\.\//, "");
	const isDir = clean.endsWith("/");
	const parts = clean.replace(/\/$/, "").split("/").filter(Boolean);
	let prefix = "";
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index] ?? "";
		const isLeaf = index === parts.length - 1;
		const key = prefix ? `${prefix}/${part}` : part;
		const indent = "  ".repeat(index);
		if (!isLeaf || isDir) {
			if (!seenDirs.has(key)) {
				seenDirs.add(key);
				rendered.push(`${theme.fg("dim", `${indent}▸`)} ${theme.fg("accent", `${part}/`)}`);
			}
		} else {
			rendered.push(`${theme.fg("dim", `${indent}•`)} ${theme.fg("toolOutput", part)}`);
		}
		prefix = key;
	}
}

function renderPathListLine(line: string, cwd: string, theme: Theme): string {
	if (!line) return "";
	if (line.startsWith("[") && line.endsWith("]")) return theme.fg("warning", line);
	const prefix = line.match(/^\s*/)?.[0] ?? "";
	const body = line.slice(prefix.length);
	const icon = body.endsWith("/") ? "▸" : "•";
	return `${theme.fg("dim", prefix + icon)} ${renderDisplayPath(body, cwd, theme, body)}`;
}
