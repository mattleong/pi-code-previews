const ALL_CODE_PREVIEW_TOOLS = ["bash", "read", "write", "edit", "grep", "find", "ls"] as const;
export type CodePreviewToolName = typeof ALL_CODE_PREVIEW_TOOLS[number];

export function getEnabledCodePreviewTools(): Set<CodePreviewToolName> {
	const raw = process.env.CODE_PREVIEW_TOOLS?.trim();
	if (!raw || raw.toLowerCase() === "all") return new Set(ALL_CODE_PREVIEW_TOOLS);
	if (raw.toLowerCase() === "none") return new Set();
	const requested = raw.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
	const enabled = new Set<CodePreviewToolName>();
	for (const tool of requested) {
		if (isCodePreviewToolName(tool)) enabled.add(tool);
	}
	return enabled;
}

export function isCodePreviewToolEnabled(name: CodePreviewToolName, enabled = getEnabledCodePreviewTools()): boolean {
	return enabled.has(name);
}

export function formatEnabledCodePreviewTools(enabled = getEnabledCodePreviewTools()): string {
	return ALL_CODE_PREVIEW_TOOLS.filter((tool) => enabled.has(tool)).join(", ") || "none";
}

function isCodePreviewToolName(value: string): value is CodePreviewToolName {
	return (ALL_CODE_PREVIEW_TOOLS as readonly string[]).includes(value);
}
