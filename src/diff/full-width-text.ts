import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { positiveEnvInteger } from "../config/env";
import { wrapAnsiToWidth } from "../shared/terminal-text";
import { createDiffBackgroundResolver, diffLineBg } from "./background";
import { DIFF_ADD_MARKER, DIFF_REMOVE_MARKER } from "./markers";

const DIFF_WRAP_ROWS = positiveEnvInteger("CODE_PREVIEW_DIFF_WRAP_ROWS", 3);

type MarkedDiffLine = { kind?: "add" | "remove"; line: string };

export class FullWidthDiffText implements Component {
  private cachedWidth: number | undefined;
  private cachedRows: string[] | undefined;

  constructor(
    private text: string,
    private readonly theme?: Theme,
  ) {}

  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedRows) return this.cachedRows;
    const diffBackground = createDiffBackgroundResolver(this.theme);
    const rows = this.text.split("\n").flatMap((rawLine) => {
      const { kind, line } = parseMarkedDiffLine(rawLine);
      const rows = wrapAnsiToWidth(line, width, DIFF_WRAP_ROWS, continuationPrefix(line));
      if (!kind) return rows.map((row) => truncateToWidth(row, width, ""));

      return rows.map((row) => {
        const truncated = truncateToWidth(row, width, "");
        const padding = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
        return diffLineBg(kind, truncated + padding, diffBackground);
      });
    });
    this.cachedWidth = width;
    this.cachedRows = rows;
    return rows;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedRows = undefined;
  }
}

function parseMarkedDiffLine(rawLine: string): MarkedDiffLine {
  if (rawLine.startsWith(DIFF_ADD_MARKER))
    return { kind: "add", line: rawLine.slice(DIFF_ADD_MARKER.length) };
  if (rawLine.startsWith(DIFF_REMOVE_MARKER))
    return { kind: "remove", line: rawLine.slice(DIFF_REMOVE_MARKER.length) };
  return { line: rawLine };
}

function continuationPrefix(line: string): string {
  const pipe = line.indexOf("│ ");
  if (pipe < 0) return "";
  return " ".repeat(visibleWidth(line.slice(0, pipe + 2)));
}
