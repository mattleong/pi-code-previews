export function escapeControlChars(text: string): string {
	return text
		.replace(/\x1b/g, "␛")
		.replace(/\r/g, "␍")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

export function visibleLength(text: string): number {
	return stripAnsi(text).length;
}

export function wrapAnsiToWidth(text: string, width: number, maxRows = 3, continuationPrefix = ""): string[] {
	if (width <= 0) return [""];
	const rows: string[] = [];
	let row = "";
	let visible = 0;
	let index = 0;
	let state = "";

	function startContinuation(): void {
		row = continuationPrefix ? state + continuationPrefix : state;
		visible = visibleLength(continuationPrefix);
	}

	while (index < text.length) {
		if (visible >= width) {
			rows.push(row);
			if (rows.length >= maxRows) return truncateLastRow(rows, width);
			startContinuation();
			continue;
		}

		if (text[index] === "\x1b") {
			const end = text.indexOf("m", index);
			if (end >= 0) {
				const sequence = text.slice(index, end + 1);
				row += sequence;
				state = updateAnsiState(state, sequence);
				index = end + 1;
				continue;
			}
		}

		row += text[index];
		visible++;
		index++;
	}

	rows.push(row);
	if (rows.length > maxRows) return truncateLastRow(rows.slice(0, maxRows), width);
	return rows;
}

function truncateLastRow(rows: string[], width: number): string[] {
	const last = rows.at(-1) ?? "";
	if (visibleLength(last) >= width && width > 1) rows[rows.length - 1] = trimAnsiToVisible(last, width - 1) + "›";
	return rows;
}

function trimAnsiToVisible(text: string, width: number): string {
	let out = "";
	let visible = 0;
	for (let index = 0; index < text.length && visible < width; index++) {
		if (text[index] === "\x1b") {
			const end = text.indexOf("m", index);
			if (end >= 0) {
				out += text.slice(index, end + 1);
				index = end;
				continue;
			}
		}
		out += text[index];
		visible++;
	}
	return out;
}

function updateAnsiState(current: string, sequence: string): string {
	if (sequence === "\x1b[0m") return "";
	if (/^\x1b\[3(?:8;[^m]+|9)m$/.test(sequence)) return replaceAnsi(current, /\x1b\[3(?:8;[^m]+|9)m/g, sequence === "\x1b[39m" ? "" : sequence);
	if (/^\x1b\[4(?:8;[^m]+|9)m$/.test(sequence)) return replaceAnsi(current, /\x1b\[4(?:8;[^m]+|9)m/g, sequence === "\x1b[49m" ? "" : sequence);
	if (sequence === "\x1b[1m" || sequence === "\x1b[22m") return replaceAnsi(current, /\x1b\[(?:1|22)m/g, sequence === "\x1b[22m" ? "" : sequence);
	return current + sequence;
}

function replaceAnsi(current: string, pattern: RegExp, replacement: string): string {
	return current.replace(pattern, "") + replacement;
}
