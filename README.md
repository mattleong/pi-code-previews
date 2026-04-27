# pi-code-previews

Syntax-highlighted TUI previews for pi's built-in tools, with code-aware rendering for `bash`, `read`, `write`, `edit`, and `grep`, plus lightweight path-list rendering for `find` and `ls`.

`pi-code-previews` preserves the original behavior of pi's tools and only changes how their calls and results are rendered.

## Features

- Syntax-highlighted `bash` command previews.
- Optional preview-only `bash` warnings for risky-looking commands such as recursive deletes, `sudo`, hard git resets, and system-path redirects.
- Syntax-highlighted `bash` output previews with truncation footers when collapsed or truncated by pi, while preserving meaningful leading/trailing whitespace.
- Syntax-highlighted `read` output using path, filename, shebang, and conservative content detection, with line numbers enabled by default.
- Optional inline image previews for `read` in Ghostty, Kitty, iTerm2, and WezTerm terminals.
- Syntax-highlighted `write` content previews, including size, line count, language metadata, and empty-content placeholders.
- Syntax-highlighted `edit` diff previews with full-width red/green changed-line highlights, dimmed context, and clearer diff headers/hunk separators.
- Proposed `edit` diffs in the tool call preview before execution, so replacements are reviewable while the tool is still pending.
- ANSI-aware wrapping for long diff lines, preserving syntax colors and changed-line backgrounds across continuation rows.
- Collapsed edit diffs by default, with configurable line counts or an `all` mode for always-expanded diff previews.
- Inline edit summaries on the edit header, including replacements/insertions/deletions, hunk count, and `+/-` line counts.
- Syntax-highlighted `grep` result previews grouped by file, with readable line prefixes and all match occurrences emphasized over source highlighting.
- Lightweight `find` and `ls` path-list rendering with configurable unicode, Nerd Font, or no icons.
- `write` result summaries for new files, no-op writes, and overwrites with highlighted diffs.
- Word-level emphasis inside paired diff add/remove lines, tuned to avoid noisy highlights in larger rewrites.
- Large diff and large file safeguards that skip expensive highlighting while keeping readable plain previews.
- Optional preview-only warnings when `read`, `write`, or `bash` output looks like it may contain secret values.
- Terminal-safe plain-text fallbacks that escape control characters in rendered previews.
- Shortened path display relative to the current working directory, or `~/...` for files under the home directory.
- Rich TextMate/VS Code-style highlighting powered by Shiki, with a setting to turn syntax highlighting off.
- `/code-preview-settings` command for theme and preview display settings, including the settings file path and restore-defaults action.
- Keeps pi's colored tool backgrounds so tool calls remain easy to parse.
- Delegates execution to pi's built-in tools; only rendering is changed.

## Screenshot

| Before | After |
| --- | --- |
| <img width="1549" height="1133" alt="Screenshot 2026-04-26 at 1 20 00 PM" src="https://github.com/user-attachments/assets/d68c10a8-b931-4e9a-8144-24558605c045" /> | <img width="1548" height="1097" alt="Screenshot 2026-04-26 at 1 18 42 PM" src="https://github.com/user-attachments/assets/5d18b219-c73f-4347-bd8c-a0bf179edf8d" /> |

## Requirements

- Node.js 20 or newer.

## Install

Install from GitHub:

```bash
pi install git:github.com/mattleong/pi-code-previews
```

Install a pinned tag or release:

```bash
pi install git:github.com/mattleong/pi-code-previews@v0.1.0
```

To try it for one run without installing:

```bash
pi -e git:github.com/mattleong/pi-code-previews
```

After installing, restart pi or run:

```text
/reload
```

## Usage

Once installed, the extension automatically enhances previews for pi's built-in tools:

- `bash`
- `read`
- `write`
- `edit`
- `grep`
- `find`
- `ls`

Configure preview appearance inside pi with:

```text
/code-preview-settings
```

Settings include:

- syntax theme
- syntax highlighting on/off
- diff background intensity
- read preview line count
- write preview line count
- edit diff preview line count, including `all`
- grep result preview line count
- path-list preview line count
- read line numbers
- inline image previews
- find/ls path icons
- bash visual warnings
- secret value warnings
- settings file path
- restore defaults

Settings are stored globally in:

```text
~/.pi/agent/code-previews.json
```

Power-user defaults can also be set with environment variables before pi starts:

```bash
CODE_PREVIEW_THEME=github-dark
CODE_PREVIEW_READ_LINES=20
CODE_PREVIEW_WRITE_LINES=20
CODE_PREVIEW_EDIT_LINES=120 # or all
CODE_PREVIEW_GREP_LINES=40
CODE_PREVIEW_PATH_LIST_LINES=40
CODE_PREVIEW_TOOLS=write,edit,grep # comma/space list, all, or none
CODE_PREVIEW_DIFF_INTENSITY=medium # off, subtle, medium
CODE_PREVIEW_DIFF_WRAP_ROWS=3
CODE_PREVIEW_INLINE_IMAGES=auto # auto or off
CODE_PREVIEW_IMAGE_PROTOCOL=iterm2 # optional: iterm2, kitty, or none
CODE_PREVIEW_PATH_ICONS=unicode # unicode, nerd, or off
CODE_PREVIEW_MAX_HIGHLIGHT_CHARS=80000
CODE_PREVIEW_CACHE_LIMIT=192
CODE_PREVIEW_ASYNC_RENDER_CHARS=20000
CODE_PREVIEW_MAX_WRITE_DIFF_BYTES=200000
```

You can also put code-preview defaults in `.pi/settings.json` globally or per project. Project settings override global settings, and the package settings file overrides both:

```json
{
  "codePreview": {
    "shikiTheme": "dark-plus",
    "grepCollapsedLines": 40,
    "pathListCollapsedLines": 40,
    "inlineImages": "auto",
    "pathIcons": "unicode"
  }
}
```

Use `/code-preview-health` to inspect active tools, Shiki status, cache size, and the settings file path.

## Terminal images and icons

Inline image previews are attempted only when `CODE_PREVIEW_INLINE_IMAGES` / `codePreview.inlineImages` is `auto` and the terminal appears to support a known graphics protocol. Supported protocols are Kitty graphics for Ghostty/Kitty and iTerm2 inline images for iTerm2/WezTerm. Inside tmux, enable passthrough if images do not appear:

```tmux
set -g allow-passthrough on
```

Path icons default to portable unicode markers. Set `CODE_PREVIEW_PATH_ICONS=nerd` or `codePreview.pathIcons: "nerd"` if you use a Nerd Font, or `off` for plain path lists.

## Screenshot / preview checklist

When updating screenshots, capture these cases so visual regressions are easy to spot:

- `edit` call with a proposed replacement before execution.
- `edit` or `write` result with a long changed line wrapping across rows.
- `grep` result where the same line contains multiple matches.
- `read` of an image in a supported terminal.
- `find` or `ls` with `pathIcons` set to `unicode`, `nerd`, and `off`.

## Scope

`pi-code-previews` is limited to TUI preview rendering for pi's existing built-in tools. `find` and `ls` return path lists rather than source code, so they get lightweight path rendering rather than syntax highlighting.

It does not:

- change tool execution
- add new tools
- change tool parameters
- sandbox or approve tool calls
- alter model behavior
- provide linting, formatting, diagnostics, autocomplete, or other code intelligence
- modify files outside the behavior of pi's original tools

## How it works

The extension re-registers pi's built-in `bash`, `read`, `write`, `edit`, `grep`, `find`, and `ls` tools with the same names and parameters. Set `CODE_PREVIEW_TOOLS` to a comma/space-separated list when you only want some renderers, for example when combining this package with `pi-pretty` or `pi-diff`. Each override delegates execution to pi's original tool implementation and customizes only the TUI rendering. For overwrite summaries, `write` also reads the previous file content before delegating, up to `CODE_PREVIEW_MAX_WRITE_DIFF_BYTES`, so it can render an after-the-fact diff without diffing very large files.

Syntax highlighting is powered by Shiki. Language selection uses pi's built-in language detection plus extension-specific filename, shebang, and conservative content detection. If a language is not available, syntax highlighting is disabled, or content is above the configured highlight limit, the preview falls back to terminal-safe plain text.

## Security

Pi extensions run with full system permissions. Review `extensions/code-previews.ts` before installing any fork of this package.

Bash and secret-looking value warnings are best-effort visual cues only. They do not block execution, redact output, change approval behavior, or provide a security boundary.

## License

MIT
