import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Text,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@mariozechner/pi-tui";
import {
  countLabel,
  hiddenLinesMarker,
  hiddenPreviewExpandHint,
  hiddenPreviewExpandLabel,
  selectPreviewLines,
  selectPreviewTextLines,
} from "../format.ts";
import { positiveEnvInteger } from "../env.ts";
import { hashString } from "../hash.ts";
import { getSecretWarnings } from "../secret-warnings.ts";
import { codePreviewSettings, type ToolCallBackgroundMode } from "../settings.ts";
import { renderHighlightedText } from "../shiki.ts";
import { escapeControlChars } from "../terminal-text.ts";

const SECRET_SCAN_CHARS = positiveEnvInteger("CODE_PREVIEW_SECRET_SCAN_CHARS", 200_000);

let themeCacheIdCounter = 0;
const themeCacheIds = new WeakMap<object, number>();

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
    context: PreviewRenderContext<TState, TArgs>,
    theme: Theme,
    render: (context: PreviewRenderContext<TState, TArgs>) => Component,
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

export function codePreviewRenderShell(
  mode: ToolCallBackgroundMode = codePreviewSettings.toolCallBackground,
): "default" | "self" {
  return mode === "on" ? "default" : "self";
}

function renderCodePreviewCall<TState, TArgs>(
  mode: ToolCallBackgroundMode,
  context: PreviewRenderContext<TState, TArgs>,
  theme: Theme,
  render: (context: PreviewRenderContext<TState, TArgs>) => Component,
): Component {
  if (mode !== "border") {
    if (!context) return render(context as PreviewRenderContext<TState, TArgs>);
    const state = timingState(context);
    if (
      context?.isPartial === true &&
      isToolCallTimingOnlyRender(state) &&
      state?.codePreviewTimingCallComponent
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
  const timingOnly = context?.isPartial === true && isToolCallTimingOnlyRender(state);
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
  const shell = reuseShell ? previousShell : new BorderedToolCall(theme, state);
  shell.setBorderColor(borderColorKey(context));
  shell.setExpandLabel(getBorderExpandLabel(state));
  shell.setTimingLabel(timing?.label);
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
  const timingOnly = context?.isPartial === true && isToolCallTimingOnlyRender(state);
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
    state.codePreviewBorderShell.setBorderColor(borderColorKey(context));
    state.codePreviewBorderShell.setExpandLabel(getBorderExpandLabel(state));
    state.codePreviewBorderShell.setTimingLabel(timing?.label);
    if (!reusedResult) state.codePreviewBorderShell.setResult(resultComponent);
  } else {
    const shell = new BorderedToolCall(theme, state);
    shell.setBorderColor(borderColorKey(context));
    shell.setExpandLabel(getBorderExpandLabel(state));
    shell.setTimingLabel(timing?.label);
    shell.setCall(state.codePreviewBorderCallComponent);
    shell.setResult(resultComponent);
    state.codePreviewBorderShell = shell;
    state.codePreviewBorderTheme = theme;
  }
  return new Container();
}

function withLastComponent<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
  lastComponent: Component | undefined,
): PreviewRenderContext<TState, TArgs> {
  return { ...context, lastComponent };
}

function unwrapTimingComponent(component: Component | undefined): Component | undefined {
  return component instanceof TimingPreservedComponent ? component.component : component;
}

type TimingState = Record<string, unknown> & {
  codePreviewTimingStartedAt?: number;
  codePreviewTimingEndedAt?: number;
  codePreviewTimingInterval?: ReturnType<typeof setInterval>;
  codePreviewTimingOnlyRenderToken?: number;
  codePreviewTimingCallComponent?: Component;
  codePreviewTimingResultComponent?: Component;
};

interface ToolCallTiming {
  label: string;
}

function renderTimedResultFooter<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
  theme: Theme,
  render: (context: PreviewRenderContext<TState, TArgs>) => Component,
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

function updateToolCallTiming<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
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

function timingState<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
): TimingState | undefined {
  return (context as { state?: unknown } | undefined)?.state as TimingState | undefined;
}

function isToolCallTimingOnlyRender(state: TimingState | undefined): boolean {
  return state?.codePreviewTimingOnlyRenderToken !== undefined;
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

type BorderSlot = "call" | "result";

type BorderState = Record<string, unknown> & {
  codePreviewBorderCallComponent?: Component;
  codePreviewBorderResultComponent?: Component;
  codePreviewBorderShell?: BorderedToolCall;
  codePreviewBorderTheme?: Theme;
  codePreviewBorderCurrentSlot?: BorderSlot;
  codePreviewBorderCallExpandLabel?: string;
  codePreviewBorderResultExpandLabel?: string;
};

function borderState<TState, TArgs>(context: PreviewRenderContext<TState, TArgs>): BorderState {
  return context.state as BorderState;
}

function renderWithBorderSlot<T>(state: BorderState, slot: BorderSlot, render: () => T): T {
  const previousSlot = state.codePreviewBorderCurrentSlot;
  state.codePreviewBorderCurrentSlot = slot;
  if (slot === "call") state.codePreviewBorderCallExpandLabel = undefined;
  else state.codePreviewBorderResultExpandLabel = undefined;
  try {
    return render();
  } finally {
    state.codePreviewBorderCurrentSlot = previousSlot;
  }
}

function getBorderExpandLabel(state: BorderState): string | undefined {
  return state.codePreviewBorderResultExpandLabel ?? state.codePreviewBorderCallExpandLabel;
}

type BorderColorKey = "borderMuted" | "warning" | "success" | "error";

function borderColorKey<TState, TArgs>(
  context: PreviewRenderContext<TState, TArgs>,
): BorderColorKey {
  if (context.isError) return "error";
  if (context.isPartial) return "warning";
  return "success";
}

class TimingPreservedComponent implements Component {
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

const RESET_ANSI = "\x1b[0m";

class BorderedToolCall implements Component {
  private callComponent: Component | undefined;
  private borderColorKey: BorderColorKey = "borderMuted";
  private expandLabel: string | undefined;
  private timingLabel: string | undefined;
  private resultComponent: Component | undefined;
  private cachedWidth: number | undefined;
  private cachedRows: string[] | undefined;

  constructor(
    private readonly theme: Theme,
    private readonly timingState: TimingState,
  ) {}

  setBorderColor(colorKey: BorderColorKey): void {
    if (this.borderColorKey === colorKey) return;
    this.borderColorKey = colorKey;
    this.invalidateCache();
  }

  setCall(component: Component | undefined): void {
    this.callComponent = component;
    this.invalidateCache();
  }

  setExpandLabel(label: string | undefined): void {
    if (this.expandLabel === label) return;
    this.expandLabel = label;
    this.invalidateCache();
  }

  setTimingLabel(label: string | undefined): void {
    if (this.timingLabel === label) return;
    this.timingLabel = label;
    this.invalidateCache();
  }

  setResult(component: Component | undefined): void {
    this.resultComponent = component;
    this.invalidateCache();
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedRows) return this.cachedRows;
    const rows = this.renderUncached(width);
    this.cachedWidth = width;
    this.cachedRows = rows;
    return rows;
  }

  invalidate(): void {
    this.invalidateCache();
    if (isToolCallTimingOnlyRender(this.timingState)) return;
    this.callComponent?.invalidate?.();
    this.resultComponent?.invalidate?.();
  }

  private invalidateCache(): void {
    this.cachedWidth = undefined;
    this.cachedRows = undefined;
  }

  private renderUncached(width: number): string[] {
    if (width < 4) return this.renderBody(Math.max(1, width));
    const innerWidth = Math.max(1, width - 4);
    const border = (value: string) => this.theme.fg(this.borderColorKey, value);
    return [
      this.renderTopBorder(width, border),
      ...this.renderBody(innerWidth).map((line) => this.frameLine(line, innerWidth, border)),
      this.renderBottomBorder(width, border),
    ];
  }

  private renderTopBorder(width: number, border: (value: string) => string): string {
    return this.renderBorderWithRightLabel(width, border, "top", this.topRightLabel());
  }

  private renderBottomBorder(width: number, border: (value: string) => string): string {
    return this.renderBorderWithRightLabel(width, border, "bottom", this.bottomRightLabel());
  }

  private renderBorderWithRightLabel(
    width: number,
    border: (value: string) => string,
    position: "top" | "bottom",
    label: string,
  ): string {
    const innerWidth = width - 2;
    const open = position === "top" ? "╭" : "╰";
    const close = position === "top" ? "╮" : "╯";
    const labelWidth = visibleWidth(label);
    if (labelWidth === 0) return border(`${open}${"─".repeat(innerWidth)}${close}`);
    if (labelWidth > innerWidth) return border(`${open}${"─".repeat(innerWidth)}${close}`);
    return `${border(open)}${border("─".repeat(innerWidth - labelWidth))}${label}${border(close)}`;
  }

  private topRightLabel(): string {
    return this.timingLabel ? ` ${this.theme.fg("muted", this.timingLabel)} ` : "";
  }

  private bottomRightLabel(): string {
    return this.expandLabel ? ` ${this.expandLabel} ` : "";
  }

  private renderBody(width: number): string[] {
    return [
      ...(this.callComponent?.render(width) ?? []),
      ...(this.resultComponent?.render(width) ?? []),
    ];
  }

  private frameLine(line: string, innerWidth: number, border: (value: string) => string): string {
    const truncated = truncateToWidth(line, innerWidth, "");
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
    return `${border("│")} ${truncated}${RESET_ANSI}${padding} ${border("│")}`;
  }
}

export function hiddenPreviewExpandHintForShell(
  state: Record<string, unknown>,
  theme: Theme,
): string {
  const borderState = state as BorderState;
  const slot = borderState.codePreviewBorderCurrentSlot;
  if (slot !== "call" && slot !== "result") return hiddenPreviewExpandHint(theme);
  if (slot === "call")
    borderState.codePreviewBorderCallExpandLabel = hiddenPreviewExpandLabel(theme);
  else borderState.codePreviewBorderResultExpandLabel = hiddenPreviewExpandLabel(theme);
  return "";
}

export function renderHiddenPreviewExpandHint(
  state: Record<string, unknown>,
  theme: Theme,
): Component {
  const hint = hiddenPreviewExpandHintForShell(state, theme);
  return hint ? new Text(hint, 0, 0) : new Container();
}

export function withSecretWarning(source: string, theme: Theme, preview: string): string {
  if (!codePreviewSettings.secretWarnings) return preview;
  const warnings = getSecretWarnings(secretScanSample(source));
  if (warnings.length === 0) return preview;
  return `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: possible ${warnings.join(", ")}`)}\n${preview}`;
}

export function countFileLines(content: string): number {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withoutFinalTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutFinalTerminator.split("\n").length;
}

export function renderHighlightedPreviewText(
  text: string,
  limit: number,
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
  lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number; total: number } {
  const preview = selectPreviewTextLines(text, limit);
  const numbered = lineNumbers
    ? {
        ...lineNumbers,
        lineNumberWidth:
          lineNumbers.lineNumberWidth ??
          String(lineNumbers.firstLine + Math.max(0, preview.total - 1)).length,
      }
    : undefined;
  return {
    ...renderHighlightedPreviewEntries(preview, lang, theme, invalidate, numbered),
    total: preview.total,
  };
}

function renderHighlightedPreviewEntries(
  preview: {
    entries: ReturnType<typeof selectPreviewLines<string>>["entries"];
    shown: number;
    hidden: number;
  },
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
  lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number } {
  const lines: string[] = [];
  const lineNumberOptions =
    lineNumbers && codePreviewSettings.readLineNumbers ? lineNumbers : undefined;
  let chunk: Array<{ line: string; index: number }> = [];

  function flushChunk(): void {
    if (chunk.length === 0) return;
    const normalizedChunk = chunk.map((entry) => entry.line.replace(/\t/g, "   "));
    const highlighted = renderHighlightedText(normalizedChunk.join("\n"), lang, theme, invalidate);
    for (let index = 0; index < chunk.length; index++) {
      const rendered =
        highlighted[index] ??
        theme.fg("toolOutput", escapeControlChars(normalizedChunk[index] ?? ""));
      if (!lineNumberOptions) {
        lines.push(rendered);
        continue;
      }
      const width =
        lineNumberOptions.lineNumberWidth ??
        String(lineNumberOptions.firstLine + chunk[index]!.index).length;
      const lineNumber = String(lineNumberOptions.firstLine + chunk[index]!.index).padStart(
        width,
        " ",
      );
      lines.push(`${theme.fg("dim", `${lineNumber} │ `)}${rendered}`);
    }
    chunk = [];
  }

  for (const entry of preview.entries) {
    if (entry.kind === "hidden") {
      flushChunk();
      lines.push(hiddenLinesMarker(theme, entry.hidden));
    } else {
      chunk.push({ line: entry.line, index: entry.index });
    }
  }
  flushChunk();
  return { lines, shown: preview.shown, hidden: preview.hidden };
}

export function renderSelectedOutputLines(
  rawLines: string[],
  limit: number,
  theme: Theme,
  renderChunk: (chunk: string[]) => string[],
): { lines: string[]; shown: number; hidden: number } {
  const preview = selectPreviewLines(rawLines, limit);
  const lines: string[] = [];
  let chunk: string[] = [];

  function flushChunk(): void {
    if (chunk.length === 0) return;
    lines.push(...renderChunk(chunk));
    chunk = [];
  }

  for (const entry of preview.entries) {
    if (entry.kind === "hidden") {
      flushChunk();
      lines.push(hiddenLinesMarker(theme, entry.hidden));
    } else {
      chunk.push(entry.line);
    }
  }
  flushChunk();
  return { lines, shown: preview.shown, hidden: preview.hidden };
}

export function cachedPreview(
  state: Record<string, unknown>,
  keyName: string,
  componentName: string,
  key: string,
  create: () => Component,
): Component {
  const cached = state[componentName];
  if (state[keyName] !== key || !cached || typeof (cached as Component).render !== "function") {
    state[keyName] = key;
    state[componentName] = create();
  }
  return state[componentName] as Component;
}

export function previewCacheKey(
  kind: string,
  source: string,
  path: string,
  expanded: boolean,
  theme: Theme,
): string {
  return [
    kind,
    path,
    expanded ? "expanded" : "collapsed",
    codePreviewSettings.shikiTheme,
    codePreviewSettings.syntaxHighlighting ? "syntax" : "plain",
    codePreviewSettings.diffIntensity,
    codePreviewSettings.wordEmphasis,
    String(codePreviewSettings.editCollapsedLines),
    themeCacheKey(theme),
    source.length,
    hashString(source),
  ].join("\0");
}

export function previewArgsKey(kind: string, source: string, path: string): string {
  return [kind, path, source.length, hashString(source)].join("\0");
}

function themeCacheKey(theme: Theme): string {
  const namedTheme = (theme as Theme & { name?: string }).name ?? "";
  if ((typeof theme !== "object" && typeof theme !== "function") || theme === null)
    return namedTheme;
  let id = themeCacheIds.get(theme);
  if (id === undefined) {
    id = ++themeCacheIdCounter;
    themeCacheIds.set(theme, id);
  }
  return `${namedTheme}\0theme:${id}`;
}

function secretScanSample(source: string): string {
  if (source.length <= SECRET_SCAN_CHARS) return source;
  const half = Math.floor(SECRET_SCAN_CHARS / 2);
  return `${source.slice(0, half)}\n${source.slice(-half)}`;
}
