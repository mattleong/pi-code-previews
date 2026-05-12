import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Text,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import { hiddenPreviewExpandHint, hiddenPreviewExpandLabel } from "./format";
import { isToolCallTimingOnlyRender, type TimingState } from "./tool-timing";

export type BorderSlot = "call" | "result";

export type BorderState = Record<string, unknown> & {
  codePreviewBorderCallComponent?: Component;
  codePreviewBorderResultComponent?: Component;
  codePreviewBorderShell?: BorderedToolCall;
  codePreviewBorderTheme?: Theme;
  codePreviewBorderCurrentSlot?: BorderSlot;
  codePreviewBorderCallExpandLabel?: string;
  codePreviewBorderResultExpandLabel?: string;
  codePreviewBorderLastCallExecutionStarted?: boolean;
  codePreviewBorderLastCallPartial?: boolean;
};

type BorderColorKey = "borderMuted" | "warning" | "success" | "error";

type BorderRenderContext = {
  isError: boolean;
  isPartial: boolean;
};

export function borderState(context: { state: unknown }): BorderState {
  return context.state as BorderState;
}

export function renderWithBorderSlot<T>(state: BorderState, slot: BorderSlot, render: () => T): T {
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

export function syncBorderShellChrome(
  shell: BorderedToolCall,
  state: BorderState,
  context: BorderRenderContext,
  timingLabel: string | undefined,
): void {
  shell.setBorderColor(borderColorKey(context));
  shell.setExpandLabel(getBorderExpandLabel(state));
  shell.setTimingLabel(timingLabel);
}

export function shouldRenderBorderResultSeparately(
  state: BorderState,
  isPartial: boolean,
): boolean {
  return (
    state.codePreviewBorderLastCallPartial === undefined ||
    (state.codePreviewBorderLastCallPartial !== isPartial &&
      state.codePreviewBorderLastCallExecutionStarted === true)
  );
}

function borderColorKey(context: BorderRenderContext): BorderColorKey {
  if (context.isError) return "error";
  if (context.isPartial) return "warning";
  return "success";
}

const RESET_ANSI = "\x1b[0m";

export class BorderedToolCall implements Component {
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
    if (labelWidth === 0 || labelWidth > innerWidth)
      return border(`${open}${"─".repeat(innerWidth)}${close}`);
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
