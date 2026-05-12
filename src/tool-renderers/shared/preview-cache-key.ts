import type { Theme } from "@earendil-works/pi-coding-agent";
import { hashString } from "../../cache/hash";
import { codePreviewSettings } from "../../settings/index";
import { getShikiStatus } from "../../syntax/shiki";

let themeCacheIdCounter = 0;
const themeCacheIds = new WeakMap<object, number>();

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

export function diffPreviewCacheKey(
  kind: string,
  source: string,
  path: string,
  expanded: boolean,
  theme: Theme,
): string {
  return [previewCacheKey(kind, source, path, expanded, theme), shikiStatusCacheKey()].join("\0");
}

export function writeCallPreviewCacheKey(
  source: string,
  path: string,
  expanded: boolean,
  theme: Theme,
): string {
  return [
    previewCacheKey("write-call", source, path, expanded, theme),
    String(codePreviewSettings.writeCollapsedLines),
    codePreviewSettings.writeContentPreview ? "write-preview" : "no-write-preview",
    codePreviewSettings.secretWarnings ? "secret-warnings" : "no-secret-warnings",
    shikiStatusCacheKey(),
  ].join("\0");
}

export function previewArgsKey(kind: string, source: string, path: string): string {
  return [kind, path, source.length, hashString(source)].join("\0");
}

function shikiStatusCacheKey(): string {
  const shikiStatus = getShikiStatus();
  return [
    shikiStatus.initialized ? "shiki-ready" : "shiki-loading",
    String(shikiStatus.loadedLanguages),
    String(shikiStatus.pendingLanguages),
    String(shikiStatus.statusVersion),
  ].join("\0");
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
