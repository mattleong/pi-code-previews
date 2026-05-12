export type WordEmphasisGoldenCase = {
  name: string;
  mode?: "all" | "smart";
  diff: string[];
  expectedSpans: string[][];
};

export const wordEmphasisGoldenCases: WordEmphasisGoldenCase[] = [
  {
    name: "simple variable rename",
    diff: ["-1 const value = oldValue;", "+1 const value = newValue;"],
    expectedSpans: [["old"], ["new"]],
  },
  {
    name: "compound identifier prefix change",
    diff: ["-1 const limit = readCollapsedLines;", "+1 const limit = editCollapsedLines;"],
    expectedSpans: [["read"], ["edit"]],
  },
  {
    name: "smart mode operator-only change",
    mode: "smart",
    diff: ["-1 if (count < limit)", "+1 if (count <= limit)"],
    expectedSpans: [[], ["="]],
  },
  {
    name: "smart mode wrapper noise suppression",
    mode: "smart",
    diff: ["-1   .map((item) => item.title)", "+1   (item) => item.title"],
    expectedSpans: [[], []],
  },
  {
    name: "ambiguous changed line pair suppression",
    diff: [
      "-1 const result = formatValue(input);",
      "+1 const result = formatLabel(input);",
      "+2 const result = formatTitle(input);",
    ],
    expectedSpans: [[], [], []],
  },
  {
    name: "high-confidence reordered lines",
    diff: [
      "-1 const alphaResult = computeAlpha(input);",
      "-2 const betaResult = computeBeta(previous);",
      "+1 const betaResult = computeBeta(current);",
      "+2 const alphaResult = computeAlpha(next);",
    ],
    expectedSpans: [["input"], ["previous"], ["current"], ["next"]],
  },
  {
    name: "soft similar replacements inside a changed token group",
    diff: ["-1 return oldValue + nextValue;", "+1 return newValue - previousValue;"],
    expectedSpans: [
      ["old", "+ next"],
      ["new", "- previous"],
    ],
  },
  {
    name: "route version inside a quoted path",
    diff: ['-1 const route = "/api/v1/users/:id";', '+1 const route = "/api/v2/users/:id";'],
    expectedSpans: [["1"], ["2"]],
  },
  {
    name: "css utility class changes",
    diff: [
      '-1 <button className="btn btn-primary px-2">',
      '+1 <button className="btn btn-secondary px-4">',
    ],
    expectedSpans: [
      ["prim", "2"],
      ["second", "4"],
    ],
  },
  {
    name: "url path and query changes",
    diff: [
      '-1 const url = "https://api.example.com/v1/users?id=123";',
      '+1 const url = "https://api.example.com/v2/users?id=124";',
    ],
    expectedSpans: [
      ["1", "3"],
      ["2", "4"],
    ],
  },
  {
    name: "file path basename changes",
    diff: [
      '-1 import Button from "src/components/Button.tsx";',
      '+1 import Card from "src/components/Card.tsx";',
    ],
    expectedSpans: [
      ["Button", "Button"],
      ["Card", "Card"],
    ],
  },
  {
    name: "markdown prose word change",
    diff: ["-1 ## Install the local package", "+1 ## Install the global package"],
    expectedSpans: [["loc"], ["glob"]],
  },
  {
    name: "single character arithmetic operator change",
    diff: ["-1 return left - right;", "+1 return left + right;"],
    expectedSpans: [["-"], ["+"]],
  },
  {
    name: "snapshot text verb tense change",
    diff: [
      '-1 expect(screen).toMatchInlineSnapshot("Loading user profile")',
      '+1 expect(screen).toMatchInlineSnapshot("Loaded user profile")',
    ],
    expectedSpans: [["ing"], ["ed"]],
  },
  {
    name: "package version change",
    diff: ['-1     "diff": "^7.0.0",', '+1     "diff": "^8.0.4",'],
    expectedSpans: [
      ["7", "0"],
      ["8", "4"],
    ],
  },
  {
    name: "jsx prop and child text changes",
    diff: [
      '-1 <Button variant="primary" onClick={saveUser}>Save</Button>',
      '+1 <Button variant="secondary" onClick={submitUser}>Submit</Button>',
    ],
    expectedSpans: [
      ["prim", "save", "Save"],
      ["second", "submit", "Submit"],
    ],
  },
  {
    name: "named import change",
    diff: [
      '-1 import { readFile } from "node:fs/promises";',
      '+1 import { writeFile } from "node:fs/promises";',
    ],
    expectedSpans: [["read"], ["write"]],
  },
  {
    name: "settings property and number change",
    diff: ["-1 readCollapsedLines: 10,", "+1 editCollapsedLines: 160,"],
    expectedSpans: [["read"], ["edit", "6"]],
  },
  {
    name: "environment variable and value change",
    diff: ["-1 CODE_PREVIEW_READ_LINES=10", "+1 CODE_PREVIEW_EDIT_LINES=160"],
    expectedSpans: [["READ"], ["EDIT", "6"]],
  },
  {
    name: "prose append highlights only appended sentence",
    diff: [
      "-119 You can also put code-preview defaults in `.pi/settings.json` globally or per project:",
      "+123 You can also put code-preview defaults in `.pi/settings.json` globally or per project. Project settings override global settings, and the package settings file overrides both:",
    ],
    expectedSpans: [
      [],
      [". Project settings override global settings, and the package settings file overrides both"],
    ],
  },
];
