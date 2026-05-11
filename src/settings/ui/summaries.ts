import type { CodePreviewSettings } from "../index";
import { formatOnOff } from "../on-off";
import { ALL_CODE_PREVIEW_TOOLS } from "../../tools/names";

export function summarizeAppearance(settings: CodePreviewSettings): string {
  return `${settings.shikiTheme} · syntax ${formatOnOff(settings.syntaxHighlighting)} · timing ${formatOnOff(settings.toolCallTiming)}`;
}

export function summarizeDiffPreviews(settings: CodePreviewSettings): string {
  return `${formatOnOff(settings.editDiffPreview)} · ${settings.diffIntensity} bg · words ${settings.wordEmphasis}`;
}

export function summarizeOutputPreviews(settings: CodePreviewSettings): string {
  return `read ${formatOnOff(settings.readContentPreview)} · write ${formatOnOff(settings.writeContentPreview)} · edit ${formatOnOff(settings.editDiffPreview)} · bash ${formatOnOff(settings.bashResultPreview)}`;
}

export function summarizeReadPreviews(settings: CodePreviewSettings): string {
  return `${formatOnOff(settings.readContentPreview)} · ${settings.readCollapsedLines} lines`;
}

export function summarizeWritePreviews(settings: CodePreviewSettings): string {
  return `${formatOnOff(settings.writeContentPreview)} · ${settings.writeCollapsedLines} lines`;
}

export function summarizeSearchListPreviews(settings: CodePreviewSettings): string {
  return `grep ${formatOnOff(settings.grepResultPreview)} · paths ${settings.pathListCollapsedLines} lines`;
}

export function summarizeBashPreviews(settings: CodePreviewSettings): string {
  return formatOnOff(settings.bashResultPreview);
}

export function summarizeTools(settings: CodePreviewSettings): string {
  if (settings.tools.length === 0) return "none";
  if (settings.tools.length === ALL_CODE_PREVIEW_TOOLS.length) return "all tools";
  return `${settings.tools.length}/${ALL_CODE_PREVIEW_TOOLS.length} tools`;
}

export function summarizeWarnings(settings: CodePreviewSettings): string {
  return `bash ${formatOnOff(settings.bashWarnings)} · secrets ${formatOnOff(settings.secretWarnings)}`;
}
