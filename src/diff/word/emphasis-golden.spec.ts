import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { renderSyntaxHighlightedDiff } from "../index";
import { codePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import { stripAnsi, testTheme } from "../../testing/render";
import { wordEmphasisGoldenCases } from "./fixtures/emphasis-golden";

const WORD_EMPHASIS_OPEN = /\x1b\[48;2;(?:64;132;82|148;62;70)m/g;
const WORD_EMPHASIS_CLOSE = "\x1b[49m";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("word emphasis golden cases match the curated corpus", () => {
  for (const goldenCase of wordEmphasisGoldenCases) {
    setCodePreviewSettings({
      ...codePreviewSettings,
      wordEmphasis: goldenCase.mode ?? "all",
    });
    const rendered = renderSyntaxHighlightedDiff(
      goldenCase.diff.join("\n"),
      undefined,
      testTheme(),
      goldenCase.diff.length,
    ).split("\n");
    assert.equal(
      rendered.length,
      goldenCase.expectedSpans.length,
      `${goldenCase.name}: rendered line count`,
    );
    assert.deepEqual(
      rendered.map(emphasizedSpans),
      goldenCase.expectedSpans,
      `${goldenCase.name}: emphasized spans`,
    );
  }
});

function emphasizedSpans(line: string): string[] {
  const spans: string[] = [];
  WORD_EMPHASIS_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_EMPHASIS_OPEN.exec(line))) {
    const start = match.index + match[0].length;
    const end = line.indexOf(WORD_EMPHASIS_CLOSE, start);
    assert.notEqual(end, -1, `unterminated word emphasis in ${JSON.stringify(line)}`);
    spans.push(stripAnsi(line.slice(start, end)));
    WORD_EMPHASIS_OPEN.lastIndex = end + WORD_EMPHASIS_CLOSE.length;
  }
  return spans;
}
