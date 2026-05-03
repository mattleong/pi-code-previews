import assert from "node:assert/strict";
import { Box, visibleWidth } from "@mariozechner/pi-tui";
import { afterEach, beforeEach, test } from "vitest";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings.ts";
import { renderComponent, testTheme } from "./test-utils.ts";
import {
  createProgressiveSyntaxHighlightedDiffText,
  FullWidthDiffText,
  renderPlainDiff,
  renderSyntaxHighlightedDiff,
  summarizeDiff,
} from "../src/diff.ts";
import { changedRanges } from "../src/diff-word-emphasis.ts";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("summarizeDiff classifies replacements, insertions, and deletions by change group", () => {
  const balanced = summarizeDiff("- 1 old\n- 2 old\n+ 1 new\n+ 2 new");
  assert.equal(balanced.additions, 2);
  assert.equal(balanced.removals, 2);
  assert.equal(balanced.replacements, 1);
  assert.equal(balanced.insertions, 0);
  assert.equal(balanced.deletions, 0);

  const withExtraLines = summarizeDiff("- 1 old\n+ 1 new\n+ 2 inserted\n context\n- 3 removed");
  assert.equal(withExtraLines.additions, 2);
  assert.equal(withExtraLines.removals, 2);
  assert.equal(withExtraLines.replacements, 1);
  assert.equal(withExtraLines.insertions, 1);
  assert.equal(withExtraLines.deletions, 1);
  assert.equal(withExtraLines.hunks, 2);
});

test("plain diff escapes terminal control characters", () => {
  const rendered = renderPlainDiff("+1 hello \x1b[31mred\x00", testTheme(), 1);
  assert.doesNotMatch(rendered, /\x1b\[31m/);
  assert.match(rendered, /␛\[31mred�/);
});

test("diff renderers honor limits at remove/add boundaries", () => {
  const diff = "-1 old\n+1 new";
  assert.equal(renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 1).split("\n").length, 1);
  assert.equal(renderPlainDiff(diff, testTheme(), 1).split("\n").length, 1);
});

test("full-width diff component wraps long ANSI lines", () => {
  const diffText = renderPlainDiff("+1 " + "x".repeat(80), testTheme(), 1);
  const rows = new FullWidthDiffText(diffText, testTheme()).render(30);
  assert.ok(rows.length > 1);
  assert.equal(visibleWidth(rows[0] ?? ""), 30);
  assert.ok(visibleWidth(rows.at(-1) ?? "") <= 30);
});

test("diff background reaches box right padding without exceeding child width", () => {
  const box = new Box(1, 0, (text) => `\x1b[48;2;1;1;1m${text}\x1b[49m`);
  box.addChild(new FullWidthDiffText(renderPlainDiff("+1 short", testTheme(), 1), testTheme()));
  const line = box.render(20)[0] ?? "";
  assert.equal(visibleWidth(line), 20);
  assert.match(line, /\x1b\[48;2;10;42;26m[^\n]* \x1b\[49m$/);
});

test("word emphasis pairs the most similar lines inside change blocks", () => {
  const diff =
    "-1 const trimmed = line.trim();\n+1 const safeLine = escapeControlChars(line);\n+2 const trimmed = safeLine.trim();";
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 3).split("\n");
  assert.doesNotMatch(rendered[1] ?? "", /\x1b\[48;2;64;132;82m/);
  assert.match(rendered[2] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1msafeLine/);
  assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mline/);
});

test("word emphasis marks low-overlap one-to-one changed pairs instead of skipping them", () => {
  const diff = "-1 out.push(pair.removed, pair.added);\n+1 block.push(next);";
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2).split("\n");
  assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mout/);
  assert.match(rendered[1] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1mblock/);
});

test("word emphasis narrows compound identifier changes to changed segments", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  const ranges = changedRanges(
    "const limit = readCollapsedLines;",
    "const limit = editCollapsedLines;",
  );
  assert.deepEqual(ranges.removed, [[14, 18]]);
  assert.deepEqual(ranges.added, [[14, 18]]);
});

test("word emphasis skips low-confidence positional pairs inside larger blocks", () => {
  const diff = [
    "-1 const total = calculateTotal(items);",
    "-2 notifyLegacySystem(payload);",
    "+1 const total = calculateTotal(next);",
    "+2 renderCompletelyDifferentScreen();",
  ].join("\n");
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 4).split("\n");
  assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mitems/);
  assert.doesNotMatch(rendered[1] ?? "", /\x1b\[48;2;148;62;70m/);
  assert.match(rendered[2] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1mnext/);
  assert.doesNotMatch(rendered[3] ?? "", /\x1b\[48;2;64;132;82m/);
});

test("smart word emphasis suppresses low-signal wrapper syntax", () => {
  const diff = "-1   .map((item) => item.title)\n+1   (item) => item.title";
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "smart" });
  const smart = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2);
  assert.doesNotMatch(smart, /\x1b\[48;2;148;62;70m/);

  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  const all = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2);
  assert.match(all, /\x1b\[48;2;148;62;70m\x1b\[1m\.map/);
});

test("word emphasis can be disabled", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "off" });
  const rendered = renderSyntaxHighlightedDiff(
    "-1 const value = oldValue;\n+1 const value = newValue;",
    undefined,
    testTheme(),
    2,
  );
  assert.doesNotMatch(rendered, /\x1b\[48;2;148;62;70m/);
  assert.doesNotMatch(rendered, /\x1b\[48;2;64;132;82m/);
});

test("word emphasis ranges stay aligned when indentation changes", () => {
  const diff =
    "-1 \tconst next = parseDiffLine(lines[i + 1]!);\n+1 \t\tconst next = parseDiffLine(lines[end]!);";
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2).split("\n");
  assert.match(rendered[0] ?? "", /lines\[\x1b\[48;2;148;62;70m\x1b\[1mi \+ 1/);
  assert.match(rendered[1] ?? "", /lines\[\x1b\[48;2;64;132;82m\x1b\[1mend/);
});

test("word emphasis highlights long shared lines with appended text", () => {
  const diff =
    "-119 You can also put code-preview defaults in `.pi/settings.json` globally or per project:\n+123 You can also put code-preview defaults in `.pi/settings.json` globally or per project. Project settings override global settings, and the package settings file overrides both:";
  const rendered = renderSyntaxHighlightedDiff(diff, "markdown", testTheme(), 2).split("\n");
  assert.doesNotMatch(rendered[0] ?? "", /\x1b\[48;2;148;62;70m/);
  assert.match(
    rendered[1] ?? "",
    /\x1b\[48;2;64;132;82m\x1b\[1m\. Project settings override global settings/,
  );
});

test("word emphasis is applied synchronously for large changed lines", () => {
  const shared = Array.from({ length: 300 }, (_, index) => `token${index}`).join(" ");
  const diff = `-1 ${shared} oldValue ${shared}\n+1 ${shared} newValue ${shared}`;
  let invalidations = 0;
  const component = createProgressiveSyntaxHighlightedDiffText(diff, undefined, testTheme(), 2, {
    invalidate: () => invalidations++,
  });
  const rendered = renderComponent(component, 12000);
  assert.equal(invalidations, 0);
  assert.match(rendered, /\x1b\[48;2;148;62;70m\x1b\[1mold/);
  assert.match(rendered, /\x1b\[48;2;64;132;82m\x1b\[1mnew/);
});

test("word range emphasis returns changed spans for unrelated token-heavy lines", () => {
  const before = Array.from({ length: 400 }, (_, index) => `before_${index}`).join(" ");
  const after = Array.from({ length: 400 }, (_, index) => `after_${index}`).join(" ");
  const ranges = changedRanges(before, after);
  assert.deepEqual(ranges.removed, [[0, before.length]]);
  assert.deepEqual(ranges.added, [[0, after.length]]);
});
