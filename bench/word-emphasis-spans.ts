import { readFileSync } from "node:fs";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderSyntaxHighlightedDiff } from "../src/diff/index";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings/index";
import { stripAnsi } from "../src/shared/terminal-text";
import { wordEmphasisTelemetry } from "../src/testing/word-emphasis-telemetry";

const WORD_EMPHASIS_OPEN = /\x1b\[48;2;(?:64;132;82|148;62;70)m\x1b\[1m/g;
const WORD_EMPHASIS_CLOSE = "\x1b[22m\x1b[49m";

const args = process.argv.slice(2);
const mode = args.includes("--smart") ? "smart" : "all";
const file = args.find((arg) => !arg.startsWith("--"));
const diff = (file ? readFileSync(file, "utf8") : readFileSync(0, "utf8")).replace(/\r?\n$/, "");

setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: mode });

const lineLimit = Math.max(1, diff.split(/\r?\n/).length);
const rendered = renderSyntaxHighlightedDiff(diff, undefined, plainTheme(), lineLimit).split("\n");
const spans = rendered.map(emphasizedSpans);

console.log(
  JSON.stringify(
    {
      mode,
      spans,
      telemetry: wordEmphasisTelemetry(diff, lineLimit, mode),
    },
    null,
    2,
  ),
);

function emphasizedSpans(line: string): string[] {
  const spans: string[] = [];
  WORD_EMPHASIS_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_EMPHASIS_OPEN.exec(line))) {
    const start = match.index + match[0].length;
    const end = line.indexOf(WORD_EMPHASIS_CLOSE, start);
    if (end < 0) break;
    spans.push(stripAnsi(line.slice(start, end)));
    WORD_EMPHASIS_OPEN.lastIndex = end + WORD_EMPHASIS_CLOSE.length;
  }
  return spans;
}

function plainTheme(): Theme {
  return {
    bold: (text: string) => text,
    fg: (_key: string, text: string) => text,
  } as Theme;
}
