import assert from "node:assert/strict";
import { type Component } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, test, vi } from "vitest";
import { previewCacheKey } from "./cache";
import { createCodePreviewToolShell } from "../../preview/tool-shell";
import { codePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import {
  cloneCodePreviewSettingsForTest,
  renderComponent,
  stripAnsi,
  testTheme,
} from "../../testing/render";

let previousCodePreviewSettings = cloneCodePreviewSettingsForTest();

beforeEach(() => {
  previousCodePreviewSettings = cloneCodePreviewSettingsForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("preview cache keys include word emphasis settings", () => {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "all" });
  const allKey = previewCacheKey("edit-result", "-1 old\n+1 new", "src/a.ts", false, testTheme());

  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "off" });
  const offKey = previewCacheKey("edit-result", "-1 old\n+1 new", "src/a.ts", false, testTheme());

  assert.notEqual(allKey, offKey);
});

test("non-border shell appends tool timing to result footer", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  const shell = createCodePreviewToolShell("on");
  const state = {};
  vi.spyOn(Date, "now").mockReturnValue(1_000);

  shell.renderCall(baseRenderContext(state, { executionStarted: true }), testTheme(), () =>
    textComponent("call"),
  );

  vi.mocked(Date.now).mockReturnValue(2_234);
  const result = shell.renderResult(
    baseRenderContext(state, { executionStarted: true, isPartial: false }),
    testTheme(),
    () => textComponent("result"),
  );

  assert.match(stripAnsi(renderComponent(result)), /result\n╰─ Took 1\.2s/);
});

test("non-border shell does not show running tool timing on the call", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  const shell = createCodePreviewToolShell("on");
  const state = {};
  vi.spyOn(Date, "now").mockReturnValue(1_000);

  const call = shell.renderCall(
    baseRenderContext(state, { executionStarted: true }),
    testTheme(),
    () => textComponent("call"),
  );

  vi.mocked(Date.now).mockReturnValue(1_500);
  assert.equal(stripAnsi(renderComponent(call)), "call");
});

test("border shell shows tool timing in top-right border", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  const shell = createCodePreviewToolShell("border");
  const state = {};
  const theme = testTheme();
  vi.spyOn(Date, "now").mockReturnValue(1_000);

  const component = shell.renderCall(
    baseRenderContext(state, { executionStarted: true }),
    theme,
    () => textComponent("call"),
  );

  vi.mocked(Date.now).mockReturnValue(2_234);
  shell.renderResult(
    baseRenderContext(state, { executionStarted: true, isPartial: false }),
    theme,
    () => textComponent("result"),
  );

  const rows = stripAnsi(renderComponent(component, 40)).split("\n");
  assert.match(rows.at(0) ?? "", /Took 1\.2s ╮$/);
  assert.doesNotMatch(rows.at(-1) ?? "", /1\.2s/);
});

test("border shell returns result content for separate final-result renderers", () => {
  const shell = createCodePreviewToolShell("border");
  const state = {};
  const theme = testTheme();

  shell.renderCall(
    baseRenderContext(state, { executionStarted: true, isPartial: true }),
    theme,
    () => textComponent("call"),
  );
  const result = shell.renderResult(baseRenderContext(state, { isPartial: false }), theme, () =>
    textComponent("result"),
  );

  assert.equal(stripAnsi(renderComponent(result)), "result");
});

test("border shell suppresses duplicate result content when call and result are composed together", () => {
  const shell = createCodePreviewToolShell("border");
  const state = {};
  const theme = testTheme();

  const call = shell.renderCall(baseRenderContext(state, { isPartial: false }), theme, () =>
    textComponent("call"),
  );
  const result = shell.renderResult(baseRenderContext(state, { isPartial: false }), theme, () =>
    textComponent("result"),
  );

  assert.match(stripAnsi(renderComponent(call)), /call/);
  assert.equal(stripAnsi(renderComponent(result)), "");
});

test("tool timing setting hides timing labels", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: false });
  const shell = createCodePreviewToolShell("on");
  const state = {};
  vi.spyOn(Date, "now").mockReturnValue(1_000);

  shell.renderCall(baseRenderContext(state, { executionStarted: true }), testTheme(), () =>
    textComponent("call"),
  );

  vi.mocked(Date.now).mockReturnValue(2_234);
  const result = shell.renderResult(
    baseRenderContext(state, { executionStarted: true, isPartial: false }),
    testTheme(),
    () => textComponent("result"),
  );

  assert.equal(stripAnsi(renderComponent(result)), "result");
});

test("tool timing excludes call and result render work", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  const shell = createCodePreviewToolShell("on");
  const state = {};
  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  shell.renderCall(baseRenderContext(state, { executionStarted: true }), testTheme(), () => {
    now = 4_000;
    return textComponent("call");
  });

  now = 5_000;
  const result = shell.renderResult(
    baseRenderContext(state, { executionStarted: true, isPartial: false }),
    testTheme(),
    () => {
      now = 9_000;
      return textComponent("result");
    },
  );

  assert.match(stripAnsi(renderComponent(result)), /╰─ Took 1\.0s/);
});

test("tool timing invalidates every 100ms while partial and stops when complete", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  vi.useFakeTimers();
  const shell = createCodePreviewToolShell("on");
  const state = {};
  let invalidations = 0;

  shell.renderCall(
    baseRenderContext(state, { executionStarted: true, invalidate: () => invalidations++ }),
    testTheme(),
    () => textComponent("call"),
  );

  vi.advanceTimersByTime(500);
  assert.equal(invalidations, 0);

  shell.renderResult(
    baseRenderContext(state, {
      executionStarted: true,
      invalidate: () => invalidations++,
      isPartial: true,
    }),
    testTheme(),
    () => textComponent("result"),
  );
  vi.advanceTimersByTime(500);
  assert.equal(invalidations, 5);

  shell.renderResult(
    baseRenderContext(state, {
      executionStarted: true,
      invalidate: () => invalidations++,
      isPartial: false,
    }),
    testTheme(),
    () => textComponent("result"),
  );
  vi.advanceTimersByTime(1_000);
  assert.equal(invalidations, 5);
});

test("tool timing invalidations reuse previous preview components", () => {
  setCodePreviewSettings({ ...codePreviewSettings, toolCallTiming: true });
  vi.useFakeTimers();
  const shell = createCodePreviewToolShell("on");
  const state = {};
  const theme = testTheme();
  let callRenders = 0;
  let resultRenders = 0;
  let childInvalidations = 0;
  let callComponent: Component | undefined;
  let resultComponent: Component | undefined;
  const invalidate = () => childInvalidations++;

  const renderPass = () => {
    callComponent?.invalidate?.();
    resultComponent?.invalidate?.();
    callComponent = shell.renderCall(
      baseRenderContext(state, { executionStarted: true, invalidate: renderPass }),
      theme,
      () => ({ ...textComponent(`call ${++callRenders}`), invalidate }),
    );
    resultComponent = shell.renderResult(
      baseRenderContext(state, {
        executionStarted: true,
        invalidate: renderPass,
        isPartial: true,
      }),
      theme,
      () => ({ ...textComponent(`result ${++resultRenders}`), invalidate }),
    );
  };

  renderPass();
  assert.equal(callRenders, 1);
  assert.equal(resultRenders, 1);
  assert.equal(childInvalidations, 0);

  vi.advanceTimersByTime(500);
  assert.equal(callRenders, 1);
  assert.equal(resultRenders, 1);
  assert.equal(childInvalidations, 0);

  resultComponent = shell.renderResult(
    baseRenderContext(state, {
      executionStarted: true,
      invalidate: renderPass,
      isPartial: false,
    }),
    theme,
    () => ({ ...textComponent(`result ${++resultRenders}`), invalidate }),
  );
  assert.equal(resultRenders, 2);
});

test("border shell caches framed rows between renders", () => {
  const shell = createCodePreviewToolShell("border");
  let renders = 0;
  const child: Component = {
    render: () => {
      renders++;
      return ["hello"];
    },
    invalidate: () => undefined,
  };
  const component = shell.renderCall(
    {
      args: {},
      argsComplete: true,
      cwd: "/tmp/project",
      executionStarted: false,
      expanded: true,
      invalidate: () => undefined,
      isError: false,
      isPartial: false,
      lastComponent: undefined,
      showImages: true,
      state: {},
      toolCallId: "tool-1",
    },
    testTheme(),
    () => child,
  );

  component.render(40);
  component.render(40);
  assert.equal(renders, 1);

  component.invalidate?.();
  component.render(40);
  assert.equal(renders, 2);
});

function textComponent(text: string): Component {
  return {
    render: () => [text],
    invalidate: () => undefined,
  };
}

interface TestRenderContext {
  args: Record<string, unknown>;
  argsComplete: boolean;
  cwd: string;
  executionStarted: boolean;
  expanded: boolean;
  invalidate: () => void;
  isError: boolean;
  isPartial: boolean;
  lastComponent: Component | undefined;
  showImages: boolean;
  state: Record<string, unknown>;
  toolCallId: string;
}

function baseRenderContext(
  state: Record<string, unknown>,
  overrides: Partial<TestRenderContext> = {},
): TestRenderContext {
  return {
    args: {},
    argsComplete: true,
    cwd: "/tmp/project",
    executionStarted: false,
    expanded: true,
    invalidate: () => undefined,
    isError: false,
    isPartial: true,
    lastComponent: undefined,
    showImages: true,
    state,
    toolCallId: "tool-1",
    ...overrides,
  };
}
