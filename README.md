# pi-syntax-highlight-tools

A pi package that adds syntax-highlighted previews for the built-in `read`, `write`, and `edit` tools while preserving their original behavior.

## Features

- Syntax-highlighted `read` output based on file extension.
- Syntax-highlighted `write` content previews.
- Syntax-highlighted `edit` diff previews.
- Rich TextMate/VS Code-style highlighting powered by Shiki, including fenced Markdown code blocks and `bash`/`sh`/`shell` fences.
- Keeps pi's colored tool backgrounds so tool calls remain easy to parse.
- Delegates execution to pi's built-in tools; only rendering is changed.

## Install

From GitHub:

```bash
pi install git:github.com/mattleong/pi-syntax-highlight-tools
```

Or try it for one run without installing:

```bash
pi -e git:github.com/mattleong/pi-syntax-highlight-tools
```

If you pin releases/tags:

```bash
pi install git:github.com/mattleong/pi-syntax-highlight-tools@v0.1.0
```

> Replace `mattleong` with the actual GitHub owner after publishing.

## Local development

Run from this repo:

```bash
pi -e ./extensions/syntax-highlight-tools.ts
```

Or install the package locally:

```bash
pi install .
```

After changing the extension, run `/reload` in pi.

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

The extension re-registers the built-in `read`, `write`, and `edit` tools with the same names. Each override delegates execution to pi's original tool implementation and customizes only the TUI rendering.

## Security

Pi extensions run with full system permissions. Review `extensions/syntax-highlight-tools.ts` before installing any fork of this package.

## License

MIT
