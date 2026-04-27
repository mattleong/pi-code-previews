type ImageProtocol = "iterm2" | "kitty" | "none";

const TMUX_PASSTHROUGH_ENV_KEYS = [
	"GHOSTTY_RESOURCES_DIR",
	"KITTY_WINDOW_ID",
	"KITTY_PID",
	"WEZTERM_EXECUTABLE",
	"WEZTERM_CONFIG_DIR",
	"WEZTERM_CONFIG_FILE",
] as const;

export type ImageContentLike = {
	type: string;
	data?: string;
	mimeType?: string;
	source?: { type?: string; data?: string; mediaType?: string };
};

export function getImageData(part: ImageContentLike): { data: string; mimeType: string } | undefined {
	const directData = typeof part.data === "string" ? part.data : undefined;
	const sourceData = part.source?.type === "base64" && typeof part.source.data === "string" ? part.source.data : undefined;
	const data = directData ?? sourceData;
	if (!data) return undefined;
	return { data, mimeType: part.mimeType ?? part.source?.mediaType ?? "image/png" };
}

export function renderInlineImagePreview(base64Data: string, mimeType: string, name = "image"): string {
	const protocol = detectImageProtocol();
	const warning = tmuxPassthroughWarning(protocol);
	if (warning) return warning;
	if (protocol === "kitty") {
		if (mimeType !== "image/png") return `Kitty/Ghostty inline preview currently supports PNG payloads (got ${mimeType})`;
		return renderKittyImage(base64Data, { cols: Math.min(termWidth() - 4, 80) });
	}
	if (protocol === "iterm2") {
		return renderIterm2Image(base64Data, { width: String(Math.min(termWidth() - 4, 80)), name });
	}
	return "Inline image preview requires Ghostty, Kitty, iTerm2, or WezTerm";
}

export function detectImageProtocol(): ImageProtocol {
	const forced = process.env.CODE_PREVIEW_IMAGE_PROTOCOL?.toLowerCase();
	if (forced === "kitty" || forced === "iterm2" || forced === "none") return forced;
	if (process.env.CODE_PREVIEW_INLINE_IMAGES?.toLowerCase() === "off") return "none";

	const term = outerTerminal().toLowerCase();
	if (term.includes("kitty") || term.includes("ghostty")) return "kitty";
	if (term.includes("iterm") || term.includes("wezterm") || term.includes("mintty")) return "iterm2";
	return "none";
}

function outerTerminal(): string {
	if (process.env.LC_TERMINAL === "iTerm2") return "iTerm.app";
	if (process.env.GHOSTTY_RESOURCES_DIR) return "ghostty";
	if (process.env.KITTY_WINDOW_ID || process.env.KITTY_PID) return "kitty";
	if (process.env.WEZTERM_EXECUTABLE || process.env.WEZTERM_CONFIG_DIR || process.env.WEZTERM_CONFIG_FILE) return "WezTerm";
	const program = process.env.TERM_PROGRAM ?? "";
	if (program && program !== "tmux" && program !== "screen") return program;
	return process.env.TERM ?? "";
}

function isTmuxSession(): boolean {
	return Boolean(process.env.TMUX) || /^(tmux|screen)/.test(process.env.TERM ?? "");
}

function tmuxPassthroughWarning(protocol: ImageProtocol): string | undefined {
	if (!isTmuxSession() || protocol === "none") return undefined;
	if (TMUX_PASSTHROUGH_ENV_KEYS.some((key) => process.env[key])) return undefined;
	return "If the image does not appear inside tmux, run: tmux set -g allow-passthrough on";
}

function tmuxWrap(sequence: string): string {
	if (!isTmuxSession()) return sequence;
	return `\x1bPtmux;${sequence.split("\x1b").join("\x1b\x1b")}\x1b\\`;
}

function renderIterm2Image(base64Data: string, opts: { width: string; name: string }): string {
	const byteSize = Math.ceil((base64Data.length * 3) / 4);
	const args = ["inline=1", "preserveAspectRatio=1", `width=${opts.width}`, `name=${Buffer.from(opts.name).toString("base64")}`, `size=${byteSize}`];
	return tmuxWrap(`\x1b]1337;File=${args.join(";")}:${base64Data}\x07`);
}

function renderKittyImage(base64Data: string, opts: { cols: number }): string {
	const chunks: string[] = [];
	const chunkSize = 4096;
	for (let offset = 0; offset < base64Data.length; offset += chunkSize) {
		const chunk = base64Data.slice(offset, offset + chunkSize);
		const first = offset === 0;
		const last = offset + chunkSize >= base64Data.length;
		const more = last ? 0 : 1;
		chunks.push(first
			? tmuxWrap(`\x1b_Ga=T,f=100,t=d,m=${more},c=${opts.cols};${chunk}\x1b\\`)
			: tmuxWrap(`\x1b_Gm=${more};${chunk}\x1b\\`));
	}
	return chunks.join("");
}

function termWidth(): number {
	const raw = process.stdout.columns || (process.stderr as NodeJS.WriteStream & { columns?: number }).columns || Number.parseInt(process.env.COLUMNS ?? "", 10) || 120;
	return Math.max(40, Math.min(raw - 4, 210));
}
