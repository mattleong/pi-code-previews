import { basename, extname } from "node:path";

export type PathIconMode = "off" | "unicode" | "nerd";

const NERD_FILE = "\uf15b";
const NERD_DIR = "\ue5ff";

const NERD_BY_NAME: Record<string, string> = {
	"package.json": "\ue71e",
	"package-lock.json": "\ue71e",
	"tsconfig.json": "\ue628",
	"readme.md": "\ue73e",
	"license": "\ue60a",
	"dockerfile": "\ue7b0",
	"makefile": "\ue615",
	".gitignore": "\ue702",
	".env": "\ue615",
	".envrc": "\ue795",
};

const NERD_BY_EXT: Record<string, string> = {
	ts: "\ue628",
	tsx: "\ue7ba",
	js: "\ue74e",
	jsx: "\ue7ba",
	json: "\ue60b",
	md: "\ue73e",
	py: "\ue73c",
	rs: "\ue7a8",
	go: "\ue724",
	java: "\ue738",
	rb: "\ue739",
	php: "\ue73d",
	html: "\ue736",
	css: "\ue749",
	scss: "\ue749",
	yaml: "\ue6a8",
	yml: "\ue6a8",
	toml: "\ue6b2",
	sh: "\ue795",
	bash: "\ue795",
	zsh: "\ue795",
	sql: "\ue706",
	xml: "\ue619",
	png: "\uf1c5",
	jpg: "\uf1c5",
	jpeg: "\uf1c5",
	gif: "\uf1c5",
	svg: "\uf1c5",
};

export function pathIcon(path: string, isDirectory: boolean, mode: PathIconMode): string {
	if (mode === "off") return "";
	if (mode === "unicode") return isDirectory ? "▸" : "•";
	if (isDirectory) return NERD_DIR;
	const name = basename(path).toLowerCase();
	return NERD_BY_NAME[name] ?? NERD_BY_EXT[extname(name).slice(1)] ?? NERD_FILE;
}
