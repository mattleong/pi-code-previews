import type { Theme } from "@mariozechner/pi-coding-agent";
import { pathIcon } from "./icons.ts";
import { codePreviewSettings } from "./settings.ts";
import { renderDisplayPath } from "./paths.ts";
import { escapeControlChars } from "./terminal-text.ts";

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
      rendered.push(theme.fg("warning", escapeControlChars(line)));
      continue;
    }
    renderTreePath(line, theme, seenDirs, rendered);
  }
  return rendered;
}

function renderTreePath(
  path: string,
  theme: Theme,
  seenDirs: Set<string>,
  rendered: string[],
): void {
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
        const icon = pathIcon(part, true, codePreviewSettings.pathIcons);
        rendered.push(
          `${theme.fg("dim", icon ? `${indent}${icon}` : indent)}${icon ? " " : ""}${theme.fg("accent", `${escapeControlChars(part)}/`)}`,
        );
      }
    } else {
      const icon = pathIcon(part, false, codePreviewSettings.pathIcons);
      rendered.push(
        `${theme.fg("dim", icon ? `${indent}${icon}` : indent)}${icon ? " " : ""}${theme.fg("toolOutput", escapeControlChars(part))}`,
      );
    }
    prefix = key;
  }
}

function renderPathListLine(line: string, cwd: string, theme: Theme): string {
  if (!line) return "";
  if (line.startsWith("[") && line.endsWith("]"))
    return theme.fg("warning", escapeControlChars(line));
  const prefix = line.match(/^\s*/)?.[0] ?? "";
  const body = line.slice(prefix.length);
  const icon = pathIcon(body, body.endsWith("/"), codePreviewSettings.pathIcons);
  return `${theme.fg("dim", icon ? prefix + icon : prefix)}${icon ? " " : ""}${renderDisplayPath(body, cwd, theme, body)}`;
}
