import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { escapeControlChars } from "../shared/terminal-text";

export function formatDisplayPath(path: string, cwd: string): string {
  if (!path) return "";

  if (isAbsolute(path)) {
    const fromCwd = relative(cwd, path);
    if (fromCwd && !isParentRelativePath(fromCwd) && !isAbsolute(fromCwd)) return fromCwd;
    if (!fromCwd) return ".";

    const home = homedir();
    const fromHome = relative(home, path);
    if (fromHome && !isParentRelativePath(fromHome) && !isAbsolute(fromHome))
      return `~/${fromHome}`;
    if (!fromHome) return "~";
  }

  return path;
}

function isParentRelativePath(path: string): boolean {
  return path === ".." || path.startsWith("../") || path.startsWith("..\\");
}

export function renderDisplayPath(
  path: string,
  cwd: string,
  theme: Theme,
  fallback = "...",
): string {
  const displayPath = formatDisplayPath(path, cwd) || fallback;
  return theme.fg("accent", escapeControlChars(displayPath));
}
