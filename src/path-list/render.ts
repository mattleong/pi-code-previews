import type { Theme } from "@earendil-works/pi-coding-agent";
import { pathIcon } from "../paths/icons";
import { renderDisplayPath } from "../paths/display";
import { escapeControlChars } from "../shared/terminal-text";
import { isToolOutputNoticeLine } from "../shared/tool-output-notice";
import type { PathIconMode } from "../settings/types";

export function renderPathListLines(
  output: string,
  cwd: string,
  theme: Theme,
  options: { iconMode: PathIconMode },
): string[] {
  const { iconMode } = options;
  const lines = output.split("\n");
  const pathLines = lines.filter((line) => line && !isToolOutputNoticeLine(line));
  const shouldTree = pathLines.some((line) => line.includes("/"));
  if (!shouldTree) return lines.map((line) => renderPathListLine(line, cwd, theme, iconMode));

  const rendered: string[] = [];
  const seenDirs = new Set<string>();
  for (const line of lines) {
    if (!line) {
      rendered.push("");
      continue;
    }
    if (isToolOutputNoticeLine(line)) {
      rendered.push(theme.fg("warning", escapeControlChars(line)));
      continue;
    }
    renderTreePath(line, theme, iconMode, seenDirs, rendered);
  }
  return rendered;
}

function renderTreePath(
  path: string,
  theme: Theme,
  iconMode: PathIconMode,
  seenDirs: Set<string>,
  rendered: string[],
): void {
  const clean = path.replace(/^\.\//, "");
  const isDir = clean.endsWith("/");
  const parts = clean.replace(/\/$/, "").split("/").filter(Boolean);
  let prefix = "";
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part === undefined) continue;
    const isLeaf = index === parts.length - 1;
    const key = prefix ? `${prefix}/${part}` : part;
    const indent = "  ".repeat(index);
    if (!isLeaf || isDir) {
      if (!seenDirs.has(key)) {
        seenDirs.add(key);
        rendered.push(renderTreeEntry(part, true, indent, theme, iconMode));
      }
    } else {
      rendered.push(renderTreeEntry(part, false, indent, theme, iconMode));
    }
    prefix = key;
  }
}

function renderTreeEntry(
  part: string,
  isDirectory: boolean,
  indent: string,
  theme: Theme,
  iconMode: PathIconMode,
): string {
  const icon = pathIcon(part, isDirectory, iconMode);
  const iconText = icon ? `${indent}${icon}` : indent;
  const gap = icon ? " " : "";
  const label = isDirectory
    ? theme.fg("accent", `${escapeControlChars(part)}/`)
    : theme.fg("toolOutput", escapeControlChars(part));
  return `${theme.fg("dim", iconText)}${gap}${label}`;
}

function renderPathListLine(
  line: string,
  cwd: string,
  theme: Theme,
  iconMode: PathIconMode,
): string {
  if (!line) return "";
  if (isToolOutputNoticeLine(line)) return theme.fg("warning", escapeControlChars(line));
  const prefix = line.match(/^\s*/)?.[0] ?? "";
  const body = line.slice(prefix.length);
  const icon = pathIcon(body, body.endsWith("/"), iconMode);
  const iconText = icon ? prefix + icon : prefix;
  const gap = icon ? " " : "";
  return `${theme.fg("dim", iconText)}${gap}${renderDisplayPath(body, cwd, theme, body)}`;
}
