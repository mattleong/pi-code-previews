# pi-tool-previews

Syntax-highlighted TUI previews for pi's built-in `bash`, `read`, `write`, and `edit` tools.

This package preserves the original behavior of those tools and only changes how their calls/results are rendered.

## Features

- Syntax-highlighted `bash` command previews.
- Syntax-highlighted `read` output based on file extension, with line numbers enabled by default.
- Syntax-highlighted `write` content previews.
- Syntax-highlighted `edit` diff previews with full-width red/green changed-line highlights, dimmed context, and clearer diff headers/hunk separators.
- Rich TextMate/VS Code-style highlighting powered by Shiki.
- `/tool-preview-settings` command for theme and preview display settings.
- Keeps pi's colored tool backgrounds so tool calls remain easy to parse.
- Delegates execution to pi's built-in tools; only rendering is changed.

## Install

From GitHub:

```bash
pi install git:github.com/mattleong/pi-tool-previews
```

Or try it for one run without installing:

```bash
pi -e git:github.com/mattleong/pi-tool-previews
```

If you pin releases/tags:

```bash
pi install git:github.com/mattleong/pi-tool-previews@v0.1.0
```

## Local development

Install dependencies, then run from this repo:

```bash
npm install
pi -e ./extensions/tool-previews.ts
```

Or install the package locally:

```bash
pi install .
```

After changing the extension, run `/reload` in pi.

## Scope

`pi-tool-previews` is limited to syntax-highlighted previews for pi's existing `bash`, `read`, `write`, and `edit` tools. It does not change tool execution, add new tool capabilities, sandbox tool calls, or modify files outside the behavior of pi's original tools.

## How it works

The package manifest in `package.json` exposes the extension through pi's package system:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

The extension re-registers the built-in `bash`, `read`, `write`, and `edit` tools with the same names. Each override delegates execution to pi's original tool implementation and customizes only the TUI rendering. Syntax highlighting is powered by Shiki; if a language is not available, the preview falls back to plain text rather than another highlighter.

## Security

Pi extensions run with full system permissions. Review `extensions/tool-previews.ts` before installing any fork of this package.

## License

MIT
