import type { SourceInfo } from "@mariozechner/pi-coding-agent";
import { ALL_CODE_PREVIEW_TOOLS, type CodePreviewToolName } from "./tool-names.ts";

export type CodePreviewToolStatus =
  | { state: "pending" }
  | { state: "active" }
  | { state: "disabled-by-config" }
  | { state: "skipped-conflict"; owner: SourceInfo };

const toolStatuses = new Map<CodePreviewToolName, CodePreviewToolStatus>();

resetCodePreviewToolStatuses(new Set());

export function resetCodePreviewToolStatuses(configuredTools: Set<CodePreviewToolName>): void {
  for (const tool of ALL_CODE_PREVIEW_TOOLS) {
    toolStatuses.set(
      tool,
      configuredTools.has(tool) ? { state: "pending" } : { state: "disabled-by-config" },
    );
  }
}

export function setCodePreviewToolStatus(
  tool: CodePreviewToolName,
  status: CodePreviewToolStatus,
): void {
  toolStatuses.set(tool, status);
}

export function getCodePreviewToolStatuses(): Map<CodePreviewToolName, CodePreviewToolStatus> {
  return new Map(toolStatuses);
}

export function formatActiveCodePreviewTools(statuses = getCodePreviewToolStatuses()): string {
  return formatToolsWithState(statuses, "active");
}

export function formatDisabledCodePreviewTools(statuses = getCodePreviewToolStatuses()): string {
  return formatToolsWithState(statuses, "disabled-by-config");
}

export function formatPendingCodePreviewTools(statuses = getCodePreviewToolStatuses()): string {
  return formatToolsWithState(statuses, "pending");
}

export function formatSkippedCodePreviewToolLines(
  statuses = getCodePreviewToolStatuses(),
): string[] {
  return ALL_CODE_PREVIEW_TOOLS.flatMap((tool) => {
    const status = statuses.get(tool);
    if (status?.state !== "skipped-conflict") return [];
    return `  ${tool} — owned by ${formatToolOwner(status.owner)}`;
  });
}

export function formatToolOwner(sourceInfo: SourceInfo): string {
  if (sourceInfo.source === "builtin") return "builtin";
  if (sourceInfo.origin === "package") return sourceInfo.source || sourceInfo.path || "unknown";
  const scope = sourceInfo.scope && sourceInfo.scope !== "temporary" ? ` ${sourceInfo.scope}` : "";
  const source = `${sourceInfo.source || "unknown"}${scope}`;
  return sourceInfo.path ? `${source} (${sourceInfo.path})` : source;
}

function formatToolsWithState(
  statuses: Map<CodePreviewToolName, CodePreviewToolStatus>,
  state: CodePreviewToolStatus["state"],
): string {
  return (
    ALL_CODE_PREVIEW_TOOLS.filter((tool) => statuses.get(tool)?.state === state).join(", ") ||
    "none"
  );
}
