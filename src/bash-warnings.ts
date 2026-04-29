export interface BashWarning {
	label: string;
	pattern: RegExp;
}

const BASH_WARNINGS: BashWarning[] = [
	{ label: "recursive delete", pattern: /\brm\b(?=[^;&|]*(?:-[\w-]*r[\w-]*|--recursive)\b)(?=[^;&|]*(?:-[\w-]*f[\w-]*|--force)\b)/i },
	{ label: "elevated privileges", pattern: /(^|[;&|]\s*)sudo\b/ },
	{ label: "recursive permission change", pattern: /\bchmod\s+(?:-[\w-]*R|--recursive)\b/ },
	{ label: "recursive ownership change", pattern: /\bchown\s+(?:-[\w-]*R|--recursive)\b/ },
	{ label: "discards git changes", pattern: /\bgit\s+reset\s+--hard\b/ },
	{ label: "removes untracked files", pattern: /\bgit\s+clean\s+-[\w-]*[fd][\w-]*\b/ },
	{ label: "removes Docker data", pattern: /\bdocker\s+system\s+prune\b/ },
	{ label: "writes to a system path", pattern: />{1,2}\s*\/?(?:etc|bin|sbin|usr|var|System|Library)\b/ },
];

export function getBashWarnings(command: string): string[] {
	const compact = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
	return BASH_WARNINGS
		.filter((warning) => warning.pattern.test(compact))
		.map((warning) => warning.label);
}
