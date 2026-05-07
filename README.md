# pi-code-previews

Syntax-highlighted previews for pi's built-in tool calls.

`pi-code-previews` makes `bash`, `read`, `write`, `edit`, `grep`, `find`, and `ls` output easier to scan in the pi TUI without changing what the tools do. If another extension already owns one of those tools, `pi-code-previews` skips that preview instead of conflicting with it.

## Install

Install from npm:

```bash
pi install npm:pi-code-previews
```

Install from GitHub:

```bash
pi install git:github.com/mattleong/pi-code-previews
```

## Features

- Syntax-highlighted previews for commands, files, diffs, and search results.
- Clearer `edit` and `write` diffs, including pending edit previews.
- Readable `grep` results grouped by file.
- Compact `find` and `ls` path lists with optional icons.
- Optional visual warnings for risky-looking shell commands and secret-looking output.
- Configurable themes, line counts, icons, and highlighting behavior.

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

The health panel shows configured tools, active previews, disabled tools, and previews skipped because another extension owns that tool. Individual tool toggles are available in the Preview tools submenu in `/code-preview-settings` and take effect after `/reload`.

Settings are stored globally in Pi's agent config directory:

```text
$PI_CODING_AGENT_DIR/code-previews.json
```

When `PI_CODING_AGENT_DIR` is not set, this defaults to:

```text
~/.pi/agent/code-previews.json
```

## Environment variables

Optional defaults can be set before pi starts:

```bash
CODE_PREVIEW_THEME=github-dark
CODE_PREVIEW_READ_LINES=20
CODE_PREVIEW_READ_CONTENT=false # true/false, on/off, yes/no, or 1/0
CODE_PREVIEW_WRITE_LINES=20
CODE_PREVIEW_EDIT_LINES=120 # or all
CODE_PREVIEW_WORD_EMPHASIS=all # all, smart, or off
CODE_PREVIEW_GREP_LINES=40
CODE_PREVIEW_GREP_RESULTS=false # true/false, on/off, yes/no, or 1/0
CODE_PREVIEW_FIND_RESULTS=false # true/false, on/off, yes/no, or 1/0
CODE_PREVIEW_LS_RESULTS=false # true/false, on/off, yes/no, or 1/0
CODE_PREVIEW_BASH_RESULTS=false # true/false, on/off, yes/no, or 1/0
CODE_PREVIEW_PATH_LIST_LINES=40
CODE_PREVIEW_PATH_ICONS=unicode # unicode, nerd, or off
CODE_PREVIEW_TOOLS=write,edit,grep # comma/space list, all, or none
```

`CODE_PREVIEW_TOOLS` overrides `codePreview.tools` for the current pi process.
When result previews are disabled, collapsed successful output is hidden while the tool call stays visible; use pi's expand shortcut to view the output on demand. `CODE_PREVIEW_BASH_RESULTS=false` applies to all successful `bash` output, while grep/find/ls result toggles also hide matching `bash` commands that start with `grep`, `find`, or `ls`.

## Project settings

You can also set defaults in `.pi/settings.json`:

```json
{
  "codePreview": {
    "shikiTheme": "dark-plus",
    "wordEmphasis": "all",
    "readContentPreview": false,
    "grepResultPreview": false,
    "findResultPreview": false,
    "lsResultPreview": false,
    "bashResultPreview": false,
    "grepCollapsedLines": 40,
    "pathListCollapsedLines": 40,
    "pathIcons": "unicode",
    "tools": ["bash", "write", "edit", "find", "ls"]
  }
}
```

## Screenshot

Write:
<img width="780" height="482" alt="Screenshot 2026-04-30 at 11 47 26 PM" src="https://github.com/user-attachments/assets/98241dc0-192c-4549-8467-381d0abd0d18" />

Read:
<img width="781" height="465" alt="Screenshot 2026-04-30 at 11 47 38 PM" src="https://github.com/user-attachments/assets/beabf2e4-e453-4548-bde4-1af9e7f8ce6a" />

Edit:
<img width="780" height="497" alt="Screenshot 2026-04-30 at 11 47 52 PM" src="https://github.com/user-attachments/assets/b6f17d63-667f-4bfc-acbf-892012b930f4" />

Bash, ls, find:
<img width="1034" height="276" alt="Screenshot 2026-04-30 at 11 47 59 PM" src="https://github.com/user-attachments/assets/99d769c2-f987-4844-a9de-fe01f2018e52" />

Grep:
<img width="780" height="541" alt="Screenshot 2026-04-30 at 11 48 10 PM" src="https://github.com/user-attachments/assets/56169abf-deef-4b6f-b647-c2b6a668ac06" />
