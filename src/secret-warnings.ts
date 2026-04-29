export interface SecretWarning {
	label: string;
	pattern: RegExp;
}

const SECRET_WARNINGS: SecretWarning[] = [
	{ label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ label: "AWS secret key", pattern: /\bAWS_SECRET_ACCESS_KEY\s*=\s*["']?[^\s'\"]{12,}/i },
	{ label: "API key", pattern: /\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|MISTRAL|GROQ|TOGETHER|PERPLEXITY|XAI)_API_KEY\s*=\s*["']?[^\s'\"]{12,}/i },
	{ label: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
	{ label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

export function getSecretWarnings(text: string): string[] {
	if (!text) return [];
	return SECRET_WARNINGS
		.filter((warning) => warning.pattern.test(text))
		.map((warning) => warning.label);
}
