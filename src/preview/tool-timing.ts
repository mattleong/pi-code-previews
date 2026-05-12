import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { codePreviewSettings } from "../settings/index";

type ToolTimingUpdateContext = {
  state: unknown;
  executionStarted: boolean;
  isPartial: boolean;
  invalidate: () => void;
};

type ToolTimingRenderContext = ToolTimingUpdateContext & {
  lastComponent: Component | undefined;
};

export type TimingState = Record<string, unknown> & {
  codePreviewTimingStartedAt?: number;
  codePreviewTimingEndedAt?: number;
  codePreviewTimingInterval?: ReturnType<typeof setInterval>;
  codePreviewTimingOnlyRenderToken?: number;
  codePreviewTimingCallComponent?: Component;
  codePreviewTimingResultComponent?: Component;
};

type ToolCallTiming = {
  label: string;
};

export function renderTimedResultFooter<TContext extends ToolTimingRenderContext>(
  context: TContext,
  theme: Theme,
  render: (context: TContext) => Component,
  timingLabel: string | undefined,
): Component {
  const state = timingState(context);
  if (!state) return render(context);
  const reusedResult = isToolCallTimingOnlyRender(state)
    ? state.codePreviewTimingResultComponent
    : undefined;
  const resultComponent =
    reusedResult ??
    render(
      withLastComponent(
        context,
        unwrapTimingComponent(state.codePreviewTimingResultComponent ?? context.lastComponent),
      ),
    );
  state.codePreviewTimingResultComponent = resultComponent;
  if (!timingLabel) return resultComponent;
  return new ToolTimingFooter(resultComponent, theme.fg("muted", `╰─ ${timingLabel}`), state);
}

export function updateToolCallTiming<TContext extends ToolTimingUpdateContext>(
  context: TContext,
  options: { animate?: boolean; formatLabel?: boolean } = {},
): ToolCallTiming | undefined {
  const state = timingState(context);
  if (!state) return undefined;
  if (!codePreviewSettings.toolCallTiming) {
    clearToolCallTimingInterval(state);
    return undefined;
  }
  if (
    context.executionStarted &&
    state.codePreviewTimingStartedAt === undefined &&
    context.isPartial !== false
  ) {
    state.codePreviewTimingStartedAt = Date.now();
    state.codePreviewTimingEndedAt = undefined;
  }

  const startedAt = state.codePreviewTimingStartedAt;
  if (startedAt === undefined) return undefined;
  if (context.isPartial === true && options.animate !== false)
    ensureToolCallTimingInterval(state, context.invalidate);
  else if (context.isPartial === false) {
    state.codePreviewTimingEndedAt ??= Date.now();
    clearToolCallTimingInterval(state);
  }

  if (options.formatLabel === false) return undefined;
  const running = context.isPartial === true;
  const endTime = running ? Date.now() : (state.codePreviewTimingEndedAt ?? Date.now());
  const label = running ? "Elapsed" : "Took";
  return { label: `${label} ${formatToolCallDuration(endTime - startedAt)}` };
}

export function timingState(context: { state?: unknown } | undefined): TimingState | undefined {
  return context?.state as TimingState | undefined;
}

export function isToolCallTimingOnlyRender(state: TimingState | undefined): boolean {
  return state?.codePreviewTimingOnlyRenderToken !== undefined;
}

export function unwrapTimingComponent(component: Component | undefined): Component | undefined {
  return component instanceof TimingPreservedComponent ? component.component : component;
}

function withLastComponent<TContext extends ToolTimingRenderContext>(
  context: TContext,
  lastComponent: Component | undefined,
): TContext {
  return { ...context, lastComponent } as TContext;
}

function ensureToolCallTimingInterval(state: TimingState, invalidate: () => void): void {
  state.codePreviewTimingInterval ??= setInterval(
    () => invalidateForToolCallTiming(state, invalidate),
    100,
  );
}

function invalidateForToolCallTiming(state: TimingState, invalidate: () => void): void {
  const token = (state.codePreviewTimingOnlyRenderToken ?? 0) + 1;
  state.codePreviewTimingOnlyRenderToken = token;
  try {
    invalidate();
  } finally {
    queueMicrotask(() => {
      if (state.codePreviewTimingOnlyRenderToken === token)
        state.codePreviewTimingOnlyRenderToken = undefined;
    });
  }
}

function clearToolCallTimingInterval(state: TimingState): void {
  if (!state.codePreviewTimingInterval) return;
  clearInterval(state.codePreviewTimingInterval);
  state.codePreviewTimingInterval = undefined;
  state.codePreviewTimingOnlyRenderToken = undefined;
}

function formatToolCallDuration(ms: number): string {
  const roundedMs = Math.max(0, Math.round(ms));
  if (roundedMs < 1000) return `${roundedMs}ms`;
  if (roundedMs < 60_000) return `${(roundedMs / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(roundedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export class TimingPreservedComponent implements Component {
  constructor(
    readonly component: Component,
    private readonly timingState: TimingState,
  ) {}

  render(width: number): string[] {
    return this.component.render(width);
  }

  invalidate(): void {
    if (!isToolCallTimingOnlyRender(this.timingState)) this.component.invalidate?.();
  }
}

class ToolTimingFooter implements Component {
  constructor(
    private readonly component: Component,
    private readonly footer: string,
    private readonly timingState: TimingState,
  ) {}

  render(width: number): string[] {
    return [...this.component.render(width), truncateToWidth(this.footer, width, "")];
  }

  invalidate(): void {
    if (!isToolCallTimingOnlyRender(this.timingState)) this.component.invalidate?.();
  }
}
