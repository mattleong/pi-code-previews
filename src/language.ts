import { basename, extname } from "node:path";
import { bundledLanguages } from "shiki";

const EXACT_BASENAMES = new Map<string, string>([
  ["dockerfile", "dockerfile"],
  ["makefile", "makefile"],
  ["gnumakefile", "makefile"],
  ["justfile", "makefile"],
  ["procfile", "shellscript"],
  ["gemfile", "ruby"],
  ["rakefile", "ruby"],
  ["cargo.lock", "toml"],
  ["package-lock.json", "json"],
  ["composer.lock", "json"],
  ["pnpm-lock.yaml", "yaml"],
  ["pnpm-lock.yml", "yaml"],
  ["yarn.lock", "yaml"],
]);

const EXTENSION_ALIASES = new Map<string, string>([
  [".env", "dotenv"],
  [".sh", "bash"],
  [".bash", "bash"],
  [".zsh", "bash"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".md", "markdown"],
  [".yml", "yaml"],
  [".yaml", "yaml"],
  [".json", "json"],
  [".toml", "toml"],
]);

const SHEBANG_ALIASES = new Map<string, string>([
  ["bash", "bash"],
  ["sh", "bash"],
  ["zsh", "bash"],
  ["python", "python"],
  ["python3", "python"],
  ["node", "javascript"],
  ["deno", "typescript"],
  ["ruby", "ruby"],
  ["php", "php"],
]);

const CONTENT_LANGUAGE_DETECTION_CHARS = positiveEnvInteger(
  "CODE_PREVIEW_CONTENT_LANGUAGE_DETECTION_CHARS",
  50_000,
);

export function resolvePreviewLanguage({
  path,
  content,
  piLanguage,
}: {
  path?: string;
  content?: string;
  piLanguage?: string;
}): string | undefined {
  return firstSupported(
    piLanguage,
    languageFromPath(path),
    languageFromShebang(content),
    languageFromContent(content),
  );
}

function languageFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const name = basename(path).toLowerCase();
  if (name.startsWith(".env")) return "dotenv";
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  const exact = EXACT_BASENAMES.get(name);
  if (exact) return exact;
  return EXTENSION_ALIASES.get(extname(name));
}

function languageFromShebang(content: string | undefined): string | undefined {
  const firstLine = content?.split("\n", 1)[0]?.trim();
  if (!firstLine?.startsWith("#!")) return undefined;
  const parts = firstLine
    .replace(/^#!\s*/, "")
    .split(/\s+/)
    .filter(Boolean);
  const envIndex = parts.findIndex((part) => basename(part) === "env");
  const command =
    envIndex >= 0 ? parts.slice(envIndex + 1).find((part) => !part.startsWith("-")) : parts[0];
  if (!command) return undefined;
  const rawExecutable = basename(command).toLowerCase();
  const executable = rawExecutable.replace(/\d+(\.\d+)?$/, "");
  return SHEBANG_ALIASES.get(executable) ?? SHEBANG_ALIASES.get(rawExecutable);
}

function languageFromContent(content: string | undefined): string | undefined {
  if (!content || content.length > CONTENT_LANGUAGE_DETECTION_CHARS) return undefined;
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && isJson(trimmed)) return "json";
  if (/^<(!doctype\s+html|html)(\s|>)/i.test(trimmed)) return "html";
  if (/^<\?xml\s/i.test(trimmed)) return "xml";
  return undefined;
}

function firstSupported(...languages: Array<string | undefined>): string | undefined {
  for (const language of languages) {
    if (language && language in bundledLanguages) return language;
  }
  return undefined;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function positiveEnvInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
