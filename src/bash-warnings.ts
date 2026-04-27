export interface BashWarning {
	label: string;
	pattern: RegExp;
}

const BASH_WARNINGS: BashWarning[] = [
	{ label: "recursive force remove", pattern: /\brm\s+(?:-[\w-]*r[\w-]*f|-[\w-]*f[\w-]*r|--recursive\s+--force|--force\s+--recursive)\b/ },
	{ label: "sudo", pattern: /(^|[;&|]\s*)sudo\b/ },
	{ label: "recursive chmod", pattern: /\bchmod\s+(?:-[\w-]*R|--recursive)\b/ },
	{ label: "recursive chown", pattern: /\bchown\s+(?:-[\w-]*R|--recursive)\b/ },
	{ label: "hard git reset", pattern: /\bgit\s+reset\s+--hard\b/ },
	{ label: "force git clean", pattern: /\bgit\s+clean\s+-[\w-]*[fd][\w-]*\b/ },
	{ label: "docker system prune", pattern: /\bdocker\s+system\s+prune\b/ },
	{ label: "redirect to system path", pattern: />{1,2}\s*\/?(?:etc|bin|sbin|usr|var|System|Library)\b/ },
];

export function getBashWarnings(command: string): string[] {
	const compact = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
	return BASH_WARNINGS
		.filter((warning) => warning.pattern.test(compact))
		.map((warning) => warning.label);
}
