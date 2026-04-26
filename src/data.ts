export function getObjectValue(value: unknown, key: string): unknown {
	return value && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

export function isTruncated(details: unknown): boolean {
	const truncation = getObjectValue(details, "truncation");
	return getObjectValue(truncation, "truncated") === true;
}

export function getEditDiff(details: unknown): string | undefined {
	const diff = getObjectValue(details, "diff");
	return typeof diff === "string" ? diff : undefined;
}

export function getPathArg(args: unknown): string {
	const path = getObjectValue(args, "path") ?? getObjectValue(args, "file_path");
	return typeof path === "string" ? path : "";
}

export function getReadStartLine(args: unknown): number {
	const offset = getObjectValue(args, "offset");
	return typeof offset === "number" && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 1;
}

export function getTextContent(content: Array<{ type: string; text?: string }> | undefined): string {
	return content
		?.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n") ?? "";
}
