import type { Theme } from "@earendil-works/pi-coding-agent";
import { codePreviewSettings } from "../settings/index";

export type DiffLineKind = "add" | "remove";
export type DiffBackgroundResolver = (kind: DiffLineKind) => string | undefined;

export function createDiffBackgroundResolver(theme?: Theme): DiffBackgroundResolver {
  const intensity = codePreviewSettings.diffIntensity;
  if (intensity === "off") return () => undefined;
  const cache: Partial<Record<DiffLineKind, string>> = {};
  return (kind) =>
    (cache[kind] ??=
      deriveDiffBg(kind, theme, intensity === "medium" ? 0.24 : 0.14) ??
      fallbackDiffBg(kind, intensity));
}

export function diffLineBg(
  kind: DiffLineKind,
  line: string,
  diffBackground: DiffBackgroundResolver,
): string {
  const bg = diffBackground(kind);
  if (!bg) return line;
  const coloredLine = line
    .replace(/\x1b\[39m/g, `\x1b[39m${bg}`)
    .replace(/\x1b\[49m/g, `\x1b[49m${bg}`);
  return `${bg}${coloredLine}\x1b[49m`;
}

function fallbackDiffBg(kind: DiffLineKind, intensity: "subtle" | "medium"): string {
  if (kind === "add") return intensity === "medium" ? "\x1b[48;2;22;68;40m" : "\x1b[48;2;10;42;26m";
  return intensity === "medium" ? "\x1b[48;2;78;36;40m" : "\x1b[48;2;50;24;30m";
}

function deriveDiffBg(
  kind: DiffLineKind,
  theme: Theme | undefined,
  intensity: number,
): string | undefined {
  const themed = theme as
    | (Theme & { getFgAnsi?: (key: string) => string; getBgAnsi?: (key: string) => string })
    | undefined;
  const fg = themed?.getFgAnsi?.(kind === "add" ? "toolDiffAdded" : "toolDiffRemoved");
  const fgRgb = parseAnsiRgb(fg ?? "");
  if (!fgRgb) return undefined;
  const base = parseAnsiRgb(
    themed?.getBgAnsi?.(kind === "add" ? "toolSuccessBg" : "toolErrorBg") ?? "",
  ) ??
    parseAnsiRgb(themed?.getBgAnsi?.("toolSuccessBg") ?? "") ?? { r: 0, g: 0, b: 0 };
  return `\x1b[48;2;${Math.round(base.r + (fgRgb.r - base.r) * intensity)};${Math.round(base.g + (fgRgb.g - base.g) * intensity)};${Math.round(base.b + (fgRgb.b - base.b) * intensity)}m`;
}

function parseAnsiRgb(ansi: string): { r: number; g: number; b: number } | undefined {
  const match = ansi.match(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
  if (!match) return undefined;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
