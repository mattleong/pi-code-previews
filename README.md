# pi-code-previews

Syntax-highlighted previews for pi's built-in tool calls.

`pi-code-previews` makes `bash`, `read`, `write`, `edit`, `grep`, `find`, and `ls` output easier to scan in the pi TUI without changing what the tools do.

## Features

- Syntax-highlighted previews for commands, files, diffs, and search results.
- Clearer `edit` and `write` diffs, including pending edit previews.
- Readable `grep` results grouped by file.
- Compact `find` and `ls` path lists with optional icons.
- Optional visual warnings for risky-looking shell commands and secret-looking output.
- Configurable themes, line counts, icons, and highlighting behavior.

## Screenshot

| Before                                                                                                                                                             | After                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <img width="1549" height="1133" alt="Screenshot 2026-04-26 at 1 20 00 PM" src="https://github.com/user-attachments/assets/d68c10a8-b931-4e9a-8144-24558605c045" /> | <img width="1548" height="1097" alt="Screenshot 2026-04-26 at 1 18 42 PM" src="https://github.com/user-attachments/assets/5d18b219-c73f-4347-bd8c-a0bf179edf8d" /> |

## Requirements

- Node.js 20 or newer.
- pi coding agent.

## Install

Install from npm:

```bash
pi install npm:pi-code-previews
```

Install from GitHub:

```bash
pi install git:github.com/mattleong/pi-code-previews
```

Try it for one run without installing:

```bash
pi -e npm:pi-code-previews
```

After installing, restart pi or run:

```text
/reload
```

## Usage

Once installed, previews are enhanced automatically for:

- `bash`
- `read`
- `write`
- `edit`
- `grep`
- `find`
- `ls`

Open settings inside pi with:

```text
/code-preview-settings
```

Check status with:

```text
/code-preview-health
```

Settings are stored globally in:

```text
~/.pi/agent/code-previews.json
```

## Environment variables

Optional defaults can be set before pi starts:

```bash
CODE_PREVIEW_THEME=github-dark
CODE_PREVIEW_READ_LINES=20
CODE_PREVIEW_WRITE_LINES=20
CODE_PREVIEW_EDIT_LINES=120 # or all
CODE_PREVIEW_GREP_LINES=40
CODE_PREVIEW_PATH_LIST_LINES=40
CODE_PREVIEW_PATH_ICONS=unicode # unicode, nerd, or off
CODE_PREVIEW_TOOLS=write,edit,grep # comma/space list, all, or none
```

## Project settings

You can also set defaults in `.pi/settings.json`:

```json
{
  "codePreview": {
    "shikiTheme": "dark-plus",
    "grepCollapsedLines": 40,
    "pathListCollapsedLines": 40,
    "pathIcons": "unicode"
  }
}
```

## Security

Pi extensions run with full system permissions. Review `index.ts` before installing any fork of this package.

Warnings are visual cues only. They do not block execution, redact output, or provide a security boundary.

## License

MIT
