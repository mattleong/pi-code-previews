export const ALL_CODE_PREVIEW_TOOLS = [
  "bash",
  "read",
  "write",
  "edit",
  "grep",
  "find",
  "ls",
] as const;

export type CodePreviewToolName = (typeof ALL_CODE_PREVIEW_TOOLS)[number];

export function isCodePreviewToolName(value: string): value is CodePreviewToolName {
  return (ALL_CODE_PREVIEW_TOOLS as readonly string[]).includes(value);
}

export function parseCodePreviewTools(
  raw: string | undefined,
): Set<CodePreviewToolName> | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "all") return new Set(ALL_CODE_PREVIEW_TOOLS);
  if (trimmed.toLowerCase() === "none") return new Set();
  const enabled = new Set<CodePreviewToolName>();
  for (const part of trimmed.split(/[\s,]+/)) {
    const tool = part.trim();
    if (isCodePreviewToolName(tool)) enabled.add(tool);
  }
  return enabled;
}
