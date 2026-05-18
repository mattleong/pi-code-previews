import assert from "node:assert/strict";
import { Box, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, test } from "vitest";
import { codePreviewSettings, setCodePreviewSettings } from "../settings/index";
import { renderComponent, stripAnsi, testTheme } from "../testing/render";
import {
  FullWidthDiffText,
  renderPlainDiff,
  renderSyntaxHighlightedDiff,
  summarizeDiff,
} from "./index";
import { createDiffBackgroundResolver, diffLineBg } from "./background";
import { wordEmphasisTelemetry } from "../testing/word-emphasis-telemetry";
import { changedRanges, changedRangesWithConfidence } from "./word/emphasis";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("summarizeDiff classifies replacements, insertions, and deletions by change group", () => {
  assert.equal(summarizeDiff("").totalLines, 1);
  assert.equal(summarizeDiff("+ 1 added\n").totalLines, 2);

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

test("diff gutters pad line numbers to keep separators aligned", () => {
  const diffText = renderPlainDiff(
    " 6 context\n+7 added\n+10 later\n-99 removed\n+100 added",
    testTheme(),
    5,
  );
  const rendered = stripAnsi(renderComponent(new FullWidthDiffText(diffText, testTheme()), 80));
  const lines = rendered.split("\n").map((line) => line.trimEnd());
  const pipeColumns = lines.map((line) => line.indexOf("│"));
  assert.deepEqual([...new Set(pipeColumns)], [5]);
  assert.equal(lines[0], "   6 │ context");
  assert.equal(lines[1], "+  7 │ added");
  assert.equal(lines[2], "+ 10 │ later");
  assert.equal(lines[3], "- 99 │ removed");
  assert.equal(lines[4], "+100 │ added");
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
  assert.match(line, /\x1b\[48;2;10;42;26m[^\n]* \x1b\[49m/);
});

test("diff background rows do NOT reset their own background", () => {
  const row = new FullWidthDiffText(
    renderPlainDiff("+1 short", testTheme(), 1),
    testTheme(),
  ).render(20)[0];
  // diff bg extends to end without trailing \x1b[49m; parent containers handle bg reset
  assert.match(row ?? "", /\x1b\[48;2;10;42;26m[^\n]*$/);
  assert.doesNotMatch(row ?? "", /\x1b\[49m$/);
});

test("diff background reaches right padding even after truncateToWidth reset", () => {
  const theme: ReturnType<typeof testTheme> = {
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
    fg: (key: string, text: string) => {
      const colors: Record<string, string> = {
        toolDiffAdded: "\x1b[38;2;100;200;100m",
      };
      const c = colors[key] ?? "";
      return c ? `${c}${text}\x1b[39m` : text;
    },
  };
  const bg = createDiffBackgroundResolver(theme)("add")!;

  // Simulate what happens when truncateToWidth appends 0m then the line is boxed
  const line = theme.fg("toolDiffAdded", "+ 33 │ ") + `\x1b[38;2;180;120;50msome code\x1b[39m`;
  const withBg = diffLineBg("add", line, createDiffBackgroundResolver(theme));
  const truncated = withBg + "\x1b[0m";
  const padding = " ".repeat(Math.max(0, 76 - visibleWidth(truncated)));
  const framed = `${theme.fg("borderMuted", "│")} ${truncated}${padding} ${theme.fg("borderMuted", "│")}`;

  // No uncolored gap before the border
  assert.doesNotMatch(framed, /\x1b\[49m\x1b\[0m \x1b\[38/, "there should be no uncolored gap");
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

test("word emphasis uses compound identifier parts when pairing changed lines", () => {
  const diff = [
    "-1 return readCollapsedLines(input);",
    "+1 return editCollapsedLines(input);",
    "+2 return renderPreview(input);",
  ].join("\n");
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 3).split("\n");
  assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mread/);
  assert.match(rendered[1] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1medit/);
  assert.doesNotMatch(rendered[2] ?? "", /\x1b\[48;2;64;132;82m/);
});

test("word emphasis skips ambiguous changed-line pairs", () => {
  const diff = [
    "-1 const result = formatValue(input);",
    "+1 const result = formatLabel(input);",
    "+2 const result = formatTitle(input);",
  ].join("\n");
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 3);
  assert.doesNotMatch(rendered, /\x1b\[48;2;148;62;70m|\x1b\[48;2;64;132;82m/);
});

test("word emphasis telemetry summarizes confidence and skipped pairs", () => {
  assert.deepEqual(
    wordEmphasisTelemetry("-1 const value = oldValue;\n+1 const value = newValue;", 2),
    {
      changedBlocks: 1,
      changedLines: { removed: 1, added: 1 },
      pairConfidence: { high: 0, medium: 1, low: 0 },
      rangeConfidence: { high: 1, medium: 0, low: 0 },
      emphasizedPairs: 1,
      skippedPairs: 0,
      skippedPotentialPairs: 0,
    },
  );

  assert.equal(
    wordEmphasisTelemetry(
      [
        "-1 const result = formatValue(input);",
        "+1 const result = formatLabel(input);",
        "+2 const result = formatTitle(input);",
      ].join("\n"),
      3,
    ).skippedPotentialPairs,
    1,
  );
});

test("word emphasis pairs high-confidence reordered lines", () => {
  const diff = [
    "-1 const alphaResult = computeAlpha(input);",
    "-2 const betaResult = computeBeta(previous);",
    "+1 const betaResult = computeBeta(current);",
    "+2 const alphaResult = computeAlpha(next);",
  ].join("\n");
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 4).split("\n");
  assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1minput/);
  assert.match(rendered[1] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mprevious/);
  assert.match(rendered[2] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1mcurrent/);
  assert.match(rendered[3] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1mnext/);
});

test("word emphasis narrows compound identifier changes to changed segments", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  const ranges = changedRanges(
    "const limit = readCollapsedLines;",
    "const limit = editCollapsedLines;",
    "all",
  );
  assert.deepEqual(ranges.removed, [[14, 18]]);
  assert.deepEqual(ranges.added, [[14, 18]]);
});

test("word emphasis narrows similar single-token edits", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  assert.deepEqual(changedRanges("value1000", "value1001", "all"), {
    removed: [[8, 9]],
    added: [[8, 9]],
  });
  assert.deepEqual(changedRanges("color", "colour", "all"), {
    removed: [],
    added: [[4, 5]],
  });
});

test("word emphasis keeps unicode refinements on text boundaries", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  assert.deepEqual(changedRanges("a\u0301Value", "a\u0302Value", "all"), {
    removed: [[0, 2]],
    added: [[0, 2]],
  });
  assert.deepEqual(changedRanges("𐐀a", "𐐁a", "all"), {
    removed: [[0, 2]],
    added: [[0, 2]],
  });
});

test("smart word emphasis keeps meaningful operator-only changes", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "smart" });
  assert.deepEqual(changedRanges("if (count < limit)", "if (count <= limit)", "smart"), {
    removed: [],
    added: [[11, 12]],
  });
});

test("word emphasis softly aligns similar replacements inside multi-token groups", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  assert.deepEqual(
    changedRanges("return oldValue + nextValue;", "return newValue - previousValue;", "all"),
    {
      removed: [
        [7, 10],
        [16, 22],
      ],
      added: [
        [7, 10],
        [16, 26],
      ],
    },
  );
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

test("word emphasis skips ambiguous positional fallback above pairing threshold", () => {
  const count = 33;
  const diff = [
    ...Array.from(
      { length: count },
      (_, index) =>
        `- ${index + 1} items.map((item) => item.shared${index % 4}).filter(Boolean) // old ${index % 3}`,
    ),
    ...Array.from({ length: count }, (_, index) => {
      const reversed = count - 1 - index;
      return `+ ${index + 1} items.map((item) => item.shared${reversed % 4}).filter(Boolean) // new ${reversed % 3}`;
    }),
  ].join("\n");

  const telemetry = wordEmphasisTelemetry(diff, count * 2);
  assert.equal(telemetry.emphasizedPairs, 0);
  assert.equal(telemetry.skippedPotentialPairs, count);
  assert.doesNotMatch(
    renderSyntaxHighlightedDiff(diff, undefined, testTheme(), count * 2),
    /\x1b\[48;2;(?:148;62;70|64;132;82)m/,
  );
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
  const diff = "-1 const value = oldValue;\n+1 const value = newValue;";
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "off" });
  const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2);
  assert.doesNotMatch(rendered, /\x1b\[48;2;148;62;70m/);
  assert.doesNotMatch(rendered, /\x1b\[48;2;64;132;82m/);

  assert.deepEqual(changedRanges("const value = oldValue;", "const value = newValue;", "off"), {
    removed: [],
    added: [],
  });
  assert.deepEqual(
    changedRangesWithConfidence("const value = oldValue;", "const value = newValue;", "off"),
    { removed: [], added: [], confidence: "low" },
  );
  assert.equal(wordEmphasisTelemetry(diff, 2, "off").emphasizedPairs, 0);
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
  const rendered = renderSyntaxHighlightedDiff(
    diff,
    undefined,
    testTheme(),
    2,
    () => invalidations++,
  );
  assert.equal(invalidations, 0);
  assert.match(rendered, /\x1b\[48;2;148;62;70m\x1b\[1mold/);
  assert.match(rendered, /\x1b\[48;2;64;132;82m\x1b\[1mnew/);
});

test("word range emphasis returns changed spans for unrelated token-heavy lines", () => {
  const before = Array.from({ length: 400 }, (_, index) => `before_${index}`).join(" ");
  const after = Array.from({ length: 400 }, (_, index) => `after_${index}`).join(" ");
  const ranges = changedRanges(before, after, "smart");
  assert.deepEqual(ranges.removed, [[0, before.length]]);
  assert.deepEqual(ranges.added, [[0, after.length]]);
});

test("word range confidence distinguishes exact and fallback-heavy changes", () => {
  assert.equal(
    changedRangesWithConfidence("const value = oldValue;", "const value = newValue;", "smart")
      .confidence,
    "high",
  );

  const before = Array.from({ length: 600 }, (_, index) => `before_${index}`).join(" ");
  const after = Array.from({ length: 600 }, (_, index) => `after_${index}`).join(" ");
  assert.equal(changedRangesWithConfidence(before, after, "smart").confidence, "low");
});
