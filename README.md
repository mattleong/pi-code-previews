# pi-code-previews

Syntax-highlighted TUI previews for pi's built-in `bash`, `read`, `write`, and `edit` tools.

`pi-code-previews` preserves the original behavior of pi's tools and only changes how their calls and results are rendered.

## Features

- Syntax-highlighted `bash` command previews.
- Syntax-highlighted `read` output based on file extension, with line numbers enabled by default.
- Syntax-highlighted `write` content previews, including empty-content placeholders.
- Syntax-highlighted `edit` diff previews with full-width red/green changed-line highlights, dimmed context, and clearer diff headers/hunk separators.
- Rich TextMate/VS Code-style highlighting powered by Shiki.
- `/code-preview-settings` command for theme and preview display settings.
- Keeps pi's colored tool backgrounds so tool calls remain easy to parse.
- Delegates execution to pi's built-in tools; only rendering is changed.

## Screenshot

<img width="1548" height="1097" alt="Screenshot 2026-04-26 at 1 18 42 PM" src="https://github.com/user-attachments/assets/5d18b219-c73f-4347-bd8c-a0bf179edf8d" />

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

Configure preview appearance inside pi with:

```text
/code-preview-settings
```

Settings include:

- syntax theme
- diff background intensity
- read preview line count
- write preview line count
- edit diff preview line count
- read line numbers

## Scope

`pi-code-previews` is limited to TUI preview rendering for pi's existing `bash`, `read`, `write`, and `edit` tools.

It does not:

- change tool execution
- add new tools
- change tool parameters
- sandbox or approve tool calls
- alter model behavior
- provide linting, formatting, diagnostics, autocomplete, or other code intelligence
- modify files outside the behavior of pi's original tools

## How it works

The extension re-registers pi's built-in `bash`, `read`, `write`, and `edit` tools with the same names and parameters. Each override delegates execution to pi's original tool implementation and customizes only the TUI rendering.

Syntax highlighting is powered by Shiki. If a language is not available, the preview falls back to plain text.

## Security

Pi extensions run with full system permissions. Review `extensions/code-previews.ts` before installing any fork of this package.

## License

MIT
