import { Text, type Component } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { escapeControlChars } from "./terminal-text.js";

const ASYNC_RENDER_CHAR_THRESHOLD = Number.parseInt(
  process.env.CODE_PREVIEW_ASYNC_RENDER_CHARS ?? "20000",
  10,
);

export function shouldRenderAsync(text: string): boolean {
  return (
    Number.isFinite(ASYNC_RENDER_CHAR_THRESHOLD) &&
    ASYNC_RENDER_CHAR_THRESHOLD > 0 &&
    text.length > ASYNC_RENDER_CHAR_THRESHOLD
  );
}

export class AsyncPreview implements Component {
  private component: Component;

  constructor(message: string, theme: Theme, compute: () => Component, invalidate: () => void) {
    this.component = new Text(theme.fg("muted", message), 0, 0);
    setTimeout(() => {
      try {
        this.component = compute();
      } catch (error) {
        this.component = new Text(
          theme.fg(
            "error",
            escapeControlChars(error instanceof Error ? error.message : String(error)),
          ),
          0,
          0,
        );
      }
      invalidate();
    }, 0);
  }

  render(width: number): string[] {
    return this.component.render(width);
  }

  invalidate(): void {
    this.component.invalidate();
  }
}
