import { FullWidthDiffText, renderSyntaxHighlightedDiff } from "../src/diff/index";
import { initializeShiki } from "../src/syntax/shiki";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings/index";
import {
  benchTheme,
  numberedLines,
  printBenchHeader,
  printLayerSummary,
  printResults,
  runBench,
} from "./helpers";

const WIDTHS = [80, 140];
let sink = 0;

type WrapCase = {
  name: string;
  diff: string;
  lang?: string;
  limit: number;
};

type RenderedCase = WrapCase & {
  mode: "plain" | "highlight";
  rendered: string;
};

const theme = benchTheme();
const previousSettings = { ...codePreviewSettings };

setCodePreviewSettings({ ...codePreviewSettings, syntaxHighlighting: true });
await initializeShiki(codePreviewSettings.shikiTheme);
try {
  printBenchHeader("diff component wrapping");
  const renderedCases = renderCases(makeWrapCases());
  const results = [];

  for (const benchCase of renderedCases) {
    for (const width of WIDTHS) {
      results.push(
        runBench(benchCase.name, "component/cold", `${benchCase.mode}/${width} cols`, () => {
          const component = new FullWidthDiffText(benchCase.rendered, theme);
          sink += component.render(width).length;
        }),
      );

      const cachedComponent = new FullWidthDiffText(benchCase.rendered, theme);
      cachedComponent.render(width);
      results.push(
        runBench(benchCase.name, "component/cached", `${benchCase.mode}/${width} cols`, () => {
          sink += cachedComponent.render(width).length;
        }),
      );

      const reflowComponent = new FullWidthDiffText(benchCase.rendered, theme);
      let currentWidth = width;
      results.push(
        runBench(
          benchCase.name,
          "component/reflow",
          `${benchCase.mode}/${width}<->${width + 37} cols`,
          () => {
            currentWidth = currentWidth === width ? width + 37 : width;
            sink += reflowComponent.render(currentWidth).length;
          },
        ),
      );
    }
  }

  printLayerSummary(results);
  console.log("component/cold constructs FullWidthDiffText and renders once.");
  console.log("component/cached measures the same-width render cache.");
  console.log("component/reflow alternates widths to force wrap/padding recomputation.");
  console.log("");
  printResults(results);
  if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);
} finally {
  setCodePreviewSettings(previousSettings);
}

function renderCases(cases: WrapCase[]): RenderedCase[] {
  const rendered: RenderedCase[] = [];
  for (const benchCase of cases) {
    for (const mode of ["plain", "highlight"] as const) {
      setCodePreviewSettings({
        ...codePreviewSettings,
        syntaxHighlighting: mode === "highlight",
        wordEmphasis: "smart",
      });
      rendered.push({
        ...benchCase,
        mode,
        rendered: renderSyntaxHighlightedDiff(
          benchCase.diff,
          benchCase.lang,
          theme,
          benchCase.limit,
        ),
      });
    }
  }
  return rendered;
}

function makeWrapCases(): WrapCase[] {
  return [
    {
      name: "many short changed lines",
      lang: "typescript",
      diff: changedPairs(160, codeLikeBefore, codeLikeAfter).join("\n"),
      limit: 320,
    },
    {
      name: "long minified json lines",
      lang: "json",
      diff: `- 1 ${minifiedJson("old", 260)}\n+ 1 ${minifiedJson("new", 260)}`,
      limit: 2,
    },
    {
      name: "unicode wide chars and tabs",
      lang: "markdown",
      diff: changedPairs(120, unicodeBefore, unicodeAfter).join("\n"),
      limit: 240,
    },
  ];
}

function changedPairs(
  count: number,
  before: (index: number) => string,
  after: (index: number) => string,
): string[] {
  return [
    ...Array.from({ length: count }, (_, index) => `- ${index + 1} ${before(index)}`),
    ...Array.from({ length: count }, (_, index) => `+ ${index + 1} ${after(index)}`),
  ];
}

function codeLikeBefore(index: number): string {
  return `const value${index} = source.oldName${index % 7}(input${index}) ?? fallback.${index};`;
}

function codeLikeAfter(index: number): string {
  return `const value${index} = target.newName${index % 7}(safeInput${index}) ?? fallback.${index};`;
}

function unicodeBefore(index: number): string {
  const words = numberedLines("東京", 8).join(" ");
  return `### 行 ${index}\t${words} 👩🏽‍💻 old-value-${index} — café naïve résumé`;
}

function unicodeAfter(index: number): string {
  const words = numberedLines("서울", 8).join(" ");
  return `### 行 ${index}\t${words} 🧑🏻‍🚀 new-value-${index} — café naive résumé`;
}

function minifiedJson(prefix: string, count: number): string {
  return JSON.stringify({
    items: Array.from({ length: count }, (_, index) => ({
      id: index,
      key: `${prefix}-${index}`,
      enabled: index % 3 === 0,
      payload: `${prefix}:${numberedLines("token", 12).join(":")}`,
    })),
  });
}
