import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  benchTheme,
  printBenchHeader,
  printLayerSummary,
  printResults,
  renderComponent,
  runBench,
} from "./helpers";

process.env.CODE_PREVIEW_TOOLS = "edit";
process.env.CODE_PREVIEW_ASYNC_RENDER_CHARS ??= "100000000";

const { codePreviewSettings, setCodePreviewSettings } = await import("../src/settings/index");
const { initializeShiki } = await import("../src/syntax/shiki");
const { registerToolRenderers } = await import("../src/tool-renderers/registration");

const WIDTH = 120;
let sink = 0;

type Renderer = {
  name: string;
  renderCall?: (args: unknown, theme: Theme, context: RenderContext) => Component;
  renderResult?: (
    result: ToolResult,
    options: { expanded: boolean; isPartial: boolean },
    theme: Theme,
    context: RenderContext,
  ) => Component;
};

type RenderContext = {
  args?: unknown;
  argsComplete: boolean;
  cwd: string;
  executionStarted: boolean;
  expanded: boolean;
  invalidate: () => void;
  isError: boolean;
  isPartial: boolean;
  lastComponent?: Component;
  showImages: boolean;
  state: Record<string, unknown>;
  toolCallId: string;
};

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
};

const previousSettings = { ...codePreviewSettings };
const theme = benchTheme();

setCodePreviewSettings({
  ...codePreviewSettings,
  editCollapsedLines: 160,
  editDiffPreview: true,
  syntaxHighlighting: true,
  toolCallBackground: "off",
  toolCallTiming: false,
  wordEmphasis: "smart",
});
await initializeShiki(codePreviewSettings.shikiTheme);

try {
  printBenchHeader("edit renderer end-to-end");
  const edit = findRenderer(registerRenderers(), "edit");
  const results = [];

  for (const benchCase of makeCallCases()) {
    results.push(
      runBench(benchCase.name, "renderCall+coldComponent", benchCase.mode, () => {
        const component = edit.renderCall!(
          benchCase.args,
          theme,
          callContext(benchCase.expanded, {}),
        );
        sink += renderComponent(component, WIDTH).length;
      }),
    );

    const state: Record<string, unknown> = {};
    const warm = () =>
      edit.renderCall!(benchCase.args, theme, callContext(benchCase.expanded, state));
    sink += renderComponent(warm(), WIDTH).length;
    results.push(
      runBench(benchCase.name, "renderCall+cachedComponent", benchCase.mode, () => {
        sink += renderComponent(warm(), WIDTH).length;
      }),
    );
  }

  for (const benchCase of makeResultCases()) {
    applyResultCaseSettings(benchCase);
    results.push(
      runBench(benchCase.name, "renderResult+coldComponent", benchCase.mode, () => {
        const state: Record<string, unknown> = {};
        const component = edit.renderResult!(
          benchCase.result,
          { expanded: benchCase.expanded, isPartial: false },
          theme,
          resultContext(benchCase.args, benchCase.expanded, state),
        );
        sink += renderComponent(component, WIDTH).length;
      }),
    );

    const state: Record<string, unknown> = {};
    const warm = () =>
      edit.renderResult!(
        benchCase.result,
        { expanded: benchCase.expanded, isPartial: false },
        theme,
        resultContext(benchCase.args, benchCase.expanded, state),
      );
    sink += renderComponent(warm(), WIDTH).length;
    results.push(
      runBench(benchCase.name, "renderResult+cachedComponent", benchCase.mode, () => {
        sink += renderComponent(warm(), WIDTH).length;
      }),
    );
  }

  printLayerSummary(results);
  console.log(
    "Cold rows create fresh renderer state, render the preview component, and render it to TUI rows.",
  );
  console.log("Cached rows reuse renderer state to measure preview-key/component caches.");
  console.log("");
  printResults(results);
  if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);
} finally {
  setCodePreviewSettings(previousSettings);
}

function registerRenderers(): Renderer[] {
  const registered: Renderer[] = [];
  registerToolRenderers(
    { registerTool: (tool: unknown) => registered.push(tool as Renderer) } as never,
    "/tmp/project",
  );
  return registered;
}

function findRenderer(renderers: Renderer[], name: string): Renderer {
  const renderer = renderers.find((candidate) => candidate.name === name);
  if (!renderer?.renderCall || !renderer.renderResult) throw new Error(`Missing ${name} renderer`);
  return renderer;
}

function callContext(expanded: boolean, state: Record<string, unknown>): RenderContext {
  return {
    argsComplete: true,
    cwd: "/tmp/project",
    executionStarted: false,
    expanded,
    invalidate: () => undefined,
    isError: false,
    isPartial: true,
    lastComponent: undefined,
    showImages: true,
    state,
    toolCallId: "bench-edit",
  };
}

function resultContext(
  args: unknown,
  expanded: boolean,
  state: Record<string, unknown>,
): RenderContext {
  return {
    ...callContext(expanded, state),
    args,
    executionStarted: true,
    isPartial: false,
  };
}

function makeCallCases(): Array<{
  name: string;
  mode: string;
  args: unknown;
  expanded: boolean;
}> {
  return [
    {
      name: "single small proposed edit",
      mode: "collapsed",
      args: editArgs(1, 1),
      expanded: false,
    },
    { name: "single small proposed edit", mode: "expanded", args: editArgs(1, 1), expanded: true },
    {
      name: "three multiline proposed edits",
      mode: "collapsed",
      args: editArgs(3, 24),
      expanded: false,
    },
    {
      name: "three multiline proposed edits",
      mode: "expanded",
      args: editArgs(3, 24),
      expanded: true,
    },
    {
      name: "hundred proposed edit blocks",
      mode: "collapsed",
      args: editArgs(100, 3),
      expanded: false,
    },
  ];
}

function makeResultCases(): Array<{
  name: string;
  mode: string;
  args: unknown;
  result: ToolResult;
  expanded: boolean;
  editDiffPreview: boolean;
  syntaxHighlighting: boolean;
  wordEmphasis: "off" | "smart";
}> {
  const args = { path: "src/generated.ts", edits: [{ oldText: "old", newText: "new" }] };
  const medium = resultWithDiff(diffBlock(220, codeBefore, codeAfter));
  const large = resultWithDiff(diffBlock(900, codeBefore, codeAfter));
  return [
    {
      name: "medium applied diff",
      mode: "collapsed/smart/plain",
      args,
      result: medium,
      expanded: false,
      editDiffPreview: true,
      syntaxHighlighting: false,
      wordEmphasis: "smart",
    },
    {
      name: "medium applied diff",
      mode: "collapsed/hidden",
      args,
      result: medium,
      expanded: false,
      editDiffPreview: false,
      syntaxHighlighting: false,
      wordEmphasis: "smart",
    },
    {
      name: "medium applied diff",
      mode: "expanded/smart/highlight",
      args,
      result: medium,
      expanded: true,
      editDiffPreview: true,
      syntaxHighlighting: true,
      wordEmphasis: "smart",
    },
    {
      name: "large applied diff",
      mode: "collapsed/off/plain",
      args,
      result: large,
      expanded: false,
      editDiffPreview: true,
      syntaxHighlighting: false,
      wordEmphasis: "off",
    },
    {
      name: "large applied diff",
      mode: "collapsed/smart/plain",
      args,
      result: large,
      expanded: false,
      editDiffPreview: true,
      syntaxHighlighting: false,
      wordEmphasis: "smart",
    },
  ];
}

function applyResultCaseSettings(benchCase: ReturnType<typeof makeResultCases>[number]): void {
  setCodePreviewSettings({
    ...codePreviewSettings,
    editDiffPreview: benchCase.editDiffPreview,
    syntaxHighlighting: benchCase.syntaxHighlighting,
    wordEmphasis: benchCase.wordEmphasis,
  });
}

function editArgs(blocks: number, linesPerBlock: number): unknown {
  return {
    path: "src/example.ts",
    edits: Array.from({ length: blocks }, (_, index) => ({
      oldText: Array.from({ length: linesPerBlock }, (__, line) =>
        codeBefore(index * linesPerBlock + line),
      ).join("\n"),
      newText: Array.from({ length: linesPerBlock }, (__, line) =>
        codeAfter(index * linesPerBlock + line),
      ).join("\n"),
    })),
  };
}

function resultWithDiff(diff: string): ToolResult {
  return { content: [{ type: "text", text: "ok" }], details: { diff } };
}

function diffBlock(
  count: number,
  before: (index: number) => string,
  after: (index: number) => string,
): string {
  return [
    ...Array.from({ length: count }, (_, index) => `- ${index + 1} ${before(index)}`),
    ...Array.from({ length: count }, (_, index) => `+ ${index + 1} ${after(index)}`),
  ].join("\n");
}

function codeBefore(index: number): string {
  return `const value${index} = source.oldName${index % 9}(input${index}) ?? fallback.${index};`;
}

function codeAfter(index: number): string {
  return `const value${index} = target.newName${index % 9}(safeInput${index}) ?? fallback.${index};`;
}
