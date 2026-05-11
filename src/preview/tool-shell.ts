import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";
import {
  BorderedToolCall,
  borderState,
  renderWithBorderSlot,
  shouldRenderBorderResultSeparately,
  syncBorderShellChrome,
} from "./bordered-tool-call";
import {
  isToolCallTimingOnlyRender,
  renderTimedResultFooter,
  TimingPreservedComponent,
  timingState,
  updateToolCallTiming,
  unwrapTimingComponent,
} from "./tool-timing";
import { codePreviewSettings, type ToolCallBackgroundMode } from "../settings/index";

export {
  hiddenPreviewExpandHintForShell,
  renderHiddenPreviewExpandHint,
} from "./bordered-tool-call";

interface PreviewRenderContext<TState, TArgs> {
  args: TArgs;
  toolCallId: string;
  invalidate: () => void;
  lastComponent: Component | undefined;
  state: TState;
  cwd: string;
  executionStarted: boolean;
  argsComplete: boolean;
  isPartial: boolean;
  expanded: boolean;
  showImages: boolean;
  isError: boolean;
}

export interface CodePreviewToolShell {
  renderShell: "default" | "self";
  renderCall<TState, TArgs>(
    context: PreviewRenderContext<TState, TArgs> | undefined,
    theme: Theme,
    render: (context: PreviewRenderContext<TState, TArgs> | undefined) => Component,
  ): Component;
  renderResult<TState, TArgs>(
    context: PreviewRenderContext<TState, TArgs>,
    theme: Theme,
    render: (context: PreviewRenderContext<TState, TArgs>) => Component,
  ): Component;
}

export function createCodePreviewToolShell(
  mode: ToolCallBackgroundMode = codePreviewSettings.toolCallBackground,
): CodePreviewToolShell {
  return {
    renderShell: codePreviewRenderShell(mode),
    renderCall: (context, theme, render) => renderCodePreviewCall(mode, context, theme, render),
    renderResult: (context, theme, render) => renderCodePreviewResult(mode, context, theme, render),
  };
}

function codePreviewRenderShell(
  mode: ToolCallBackgroundMode = codePreviewSettings.toolCallBackground,
): "default" | "self" {
  return mode === "on" ? "default" : "self";
}

function renderCodePreviewCall<TState, TArgs>(
  mode: ToolCallBackgroundMode,
  context: PreviewRenderContext<TState, TArgs> | undefined,
  theme: Theme,
  render: (context: PreviewRenderContext<TState, TArgs> | undefined) => Component,
): Component {
  if (!context) return render(context);
  if (mode !== "border") {
    const state = timingState(context);
    if (
      context.isPartial === true &&
      state &&
      isToolCallTimingOnlyRender(state) &&
      state.codePreviewTimingCallComponent
    ) {
      updateToolCallTiming(context, { animate: false, formatLabel: false });
      return state.codePreviewTimingCallComponent;
    }
    const component = render(
      withLastComponent(context, unwrapTimingComponent(context.lastComponent)),
    );
    const previousWrapped = state?.codePreviewTimingCallComponent;
    const wrapped =
      state &&
      previousWrapped instanceof TimingPreservedComponent &&
      previousWrapped.component === component
        ? previousWrapped
        : state
          ? new TimingPreservedComponent(component, state)
          : component;
    if (state) state.codePreviewTimingCallComponent = wrapped;
    updateToolCallTiming(context, { animate: false, formatLabel: false });
    return wrapped;
  }
  const state = borderState(context);
  const timingOnly = context.isPartial === true && isToolCallTimingOnlyRender(state);
  const previousShell = state.codePreviewBorderShell;
  const reuseShell =
    previousShell instanceof BorderedToolCall && state.codePreviewBorderTheme === theme;
  const reusedCall = timingOnly ? state.codePreviewBorderCallComponent : undefined;
  const callComponent =
    reusedCall ??
    renderWithBorderSlot(state, "call", () =>
      render(withLastComponent(context, state.codePreviewBorderCallComponent)),
    );
  const timing = updateToolCallTiming(context);
  state.codePreviewBorderCallComponent = callComponent;
  state.codePreviewBorderLastCallExecutionStarted = context.executionStarted;
  state.codePreviewBorderLastCallPartial = context.isPartial;
  const shell = reuseShell ? previousShell : new BorderedToolCall(theme, state);
  syncBorderShellChrome(shell, state, context, timing?.label);
  if (!reusedCall || !reuseShell) shell.setCall(callComponent);
  if (!timingOnly || !reuseShell) shell.setResult(state.codePreviewBorderResultComponent);
  state.codePreviewBorderShell = shell;
  state.codePreviewBorderTheme = theme;
  return shell;
}

function renderCodePreviewResult<TState, TArgs>(
  mode: ToolCallBackgroundMode,
  context: PreviewRenderContext<TState, TArgs>,
  theme: Theme,
  render: (context: PreviewRenderContext<TState, TArgs>) => Component,
): Component {
  const timing = updateToolCallTiming(context);
  if (mode !== "border") {
    if (!timing?.label && !isToolCallTimingOnlyRender(timingState(context))) return render(context);
    return renderTimedResultFooter(context, theme, render, timing?.label);
  }
  const state = borderState(context);
  const timingOnly = context.isPartial === true && isToolCallTimingOnlyRender(state);
  const reusedResult = timingOnly ? state.codePreviewBorderResultComponent : undefined;
  const resultComponent =
    reusedResult ??
    renderWithBorderSlot(state, "result", () =>
      render(withLastComponent(context, state.codePreviewBorderResultComponent)),
    );
  state.codePreviewBorderResultComponent = resultComponent;
  if (
    state.codePreviewBorderShell instanceof BorderedToolCall &&
    state.codePreviewBorderTheme === theme
  ) {
    syncBorderShellChrome(state.codePreviewBorderShell, state, context, timing?.label);
    if (!reusedResult) state.codePreviewBorderShell.setResult(resultComponent);
  } else {
    const shell = new BorderedToolCall(theme, state);
    syncBorderShellChrome(shell, state, context, timing?.label);
    shell.setCall(state.codePreviewBorderCallComponent);
    shell.setResult(resultComponent);
    state.codePreviewBorderShell = shell;
    state.codePreviewBorderTheme = theme;
  }
  return shouldRenderBorderResultSeparately(state, context.isPartial)
    ? resultComponent
    : new Container();
}

function withLastComponent<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
  lastComponent: Component | undefined,
): PreviewRenderContext<TState, TArgs> {
  return { ...context, lastComponent };
}
