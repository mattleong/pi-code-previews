import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";

export function formatDisplayPath(path: string, cwd: string): string {
	if (!path) return "";

	if (isAbsolute(path)) {
		const fromCwd = relative(cwd, path);
		if (fromCwd && !fromCwd.startsWith("..") && !isAbsolute(fromCwd)) return fromCwd;
		if (!fromCwd) return ".";

		const home = homedir();
		const fromHome = relative(home, path);
		if (fromHome && !fromHome.startsWith("..") && !isAbsolute(fromHome)) return `~/${fromHome}`;
		if (!fromHome) return "~";
	}

	return path;
}

export function renderDisplayPath(path: string, cwd: string, theme: Theme, fallback = "..."): string {
	const displayPath = formatDisplayPath(path, cwd) || fallback;
	return theme.fg("accent", displayPath);
}
