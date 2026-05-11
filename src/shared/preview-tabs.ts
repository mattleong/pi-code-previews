export const PREVIEW_TAB_REPLACEMENT = "   ";

export function expandPreviewTabs(text: string): string {
  return text.replace(/\t/g, PREVIEW_TAB_REPLACEMENT);
}
