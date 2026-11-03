# Glimpse dataset and scoring spec

How Glimpse's formatting is measured. Data lives in `research/dataset/` (gitignored: it contains private session text). This spec is the contract between the dataset builder, the scorer and `format.js`.

## Source of truth

Calibrated 2026-10-12 (design record, "Dataset feasibility and calibration"): a clipboard copy from Claude Code's terminal is an exact slice of the screen's logical lines, and a hidden tmux render captured with `capture-pane -p -J` reproduces those lines (16/17 real copies exact).

- **Input**: a slice of a tmux `-J` capture of a resumed session (`claude --resume <id> --fork-session --setting-sources user --strict-mcp-config --mcp-config '{"mcpServers":{}}'`, launched from the session's `cwd`, widths 100 and 150).
- **Truth**: the raw markdown of each assistant text reply in the session transcript.

## Files

| File | Content |
|---|---|
| `research/dataset/inventory.json` | All sessions with rich replies and their content features |
| `research/dataset/sessions.json` | Sessions chosen for rendering |
| `research/dataset/renders/<sid>-w<width>.txt` | Raw `-J` capture |
| `research/dataset/samples.jsonl` | One labeled sample per line (schema below) |
| `research/dataset/gold.jsonl` | the maintainer's real copies, same schema, scored separately |

## Sample schema (`samples.jsonl`)

```json
{
  "id": "bd2226b8-w100-r3-block-2",
  "session": "bd2226b8-...", "width": 100, "reply": 3,
  "kind": "whole | block | midline | partial | spill | multi",
  "input": "exact clipboard text",
  "lines": [ { "type": "para", "block": 0, "cont": false } ],
  "blocks": [ { "type": "para", "text": "normalized expected text" } ]
}
```

- `lines` has exactly one entry per `input.split("\n")` line.
- `type`: `heading | para | list | quote | table | code | diagram | rule | blank | chrome`.
  - `chrome` = terminal UI, not reply content: `⏺ Tool(...)` call lines, `⎿` tool output, `✻ Worked for...` status, `❯` prompt lines, prompt-box borders, shell prompts.
  - The `⏺` marker on a reply's first content line is NOT chrome; that line takes its content type.
- `block`: index into `blocks` (same index = same source block); `null` for `blank` and `chrome`.
  - A list is one block **per item** (nested children are their own items).
  - A table is one block (header + rows). A fenced code block or diagram is one block.
- `cont`: `true` if this line is a terminal soft-wrap continuation of the previous input line, i.e. the two belong to the same logical line of the source and should be joined. First line of a block is always `false`. Code, table and diagram lines are `false` unless the terminal visibly wrapped a single source line (rare; label it `true` if detectable).
- `blocks[i].text` normalization: markdown syntax removed the way the terminal removes it (no `#`, `**`, backticks, link URLs), whitespace runs collapsed to one space, trimmed. For `code`/`diagram`: lines joined by `\n`, common indent removed, trailing spaces trimmed. For `table`: `rows` = array of arrays of trimmed cell strings (header first) instead of `text`.
- Partial selections: blocks cut by the selection keep only the selected portion (text normalized the same way).

## Selection kinds

| Kind | What it simulates |
|---|---|
| `whole` | One full reply, including the `⏺` line and 2-space indent |
| `block` | One block, line-aligned |
| `midline` | Starts and/or ends inside a line (random character offsets), spanning 1-4 blocks |
| `partial` | Some lines of a code, table or diagram block |
| `spill` | A reply plus neighbouring chrome (tool call/output before, status/prompt after) |
| `multi` | Two or three consecutive replies with the chrome between them |

## Formatter contract (`format.js`)

```js
format(text, opts) -> { markdown: string, lines: [ { type, cont } ] }
```

`lines` has one entry per input line, in the same type vocabulary, with `cont` meaning "joined to the previous line in the output". `opts.parseMermaid` is an optional async validator (mermaid's parser in the app; a stub or mermaid in node). Formatters may return `type: "chrome"` for lines they drop.

Engine v2 additions (docs/engine-v2.md, revision 3):

- `type: "verbatim"`: the floor. Lines shown exactly as they arrived, line breaks kept, body font. Counts as neither correct nor damage.
- `demoted: true` on a `chrome` line: terminal UI kept in the output, dimmed in place. Not deletion; a demoted reply line is a type error.
- Both travel in the markdown as HTML blocks the panel styles: `<div class="g-demoted">` and `<div class="g-verbatim">`, each holding its lines verbatim with `&`, `<`, `>` escaped, one input line per text line, a whitespace-only line written as `&#8203;` (in marked, a blank or whitespace-only line ends the HTML block). The first line sits on the same line as the opening tag and `</div>` closes the last line (a newline there shows as an extra blank line under pre-wrap); a blank line follows `</div>` (without it, the next markdown line is swallowed as raw text). The panel shows them with `white-space: pre-wrap`; copy actions leave `.g-demoted` out.
- `trace` (optional): one entry per output block, `{ type, lines: [from, to], reasons }`, so a report can answer "why code?".

## Splits

`samples.jsonl` is split by **session** (a reply rendered at two widths and six selection kinds must not land on both sides): `samples-tune.jsonl` (80% of sessions) is the only split used to set `engine/policy.js`; `samples-heldout.jsonl` (20%) is scored and reported, never tuned on. Assignment is a stable hash of the session id, so rebuilding the dataset keeps the split.

## Metrics (`research/dataset/score.mjs`)

Computed over all samples and per `kind` and per content type; the gold set is reported separately.

| Metric | Definition |
|---|---|
| **Line type accuracy** | Share of non-blank lines whose predicted type equals the truth. Also macro-averaged over types |
| **Join precision / recall** | Over lines with truth type `para`, `list`, `quote` or `heading`: predicted `cont` vs truth `cont` |
| **Block recovery** | Share of truth blocks reproduced exactly: same type and identical normalized text (or rows) in the formatter's markdown |
| **Never-worse rate** (headline) | Share of samples with **no damage**. Damage = reply content predicted `chrome` (dropped = deleted text), or any input word missing from the output (engine v2 revision 3; markers the formatter deliberately rewrites, like `⏺` or bullet glyphs, excepted), or a line with truth type `code` or `diagram` predicted `table` (2-D layout torn into cells), or a line with truth type `code`, `table`, `diagram` predicted as `para`/`list`/`quote`/`heading`, or a line with truth `cont: false` and truth type in `code | table | diagram | list | heading` predicted `cont: true` |
| Chrome handling | Share of truth `chrome` lines predicted `chrome` |

The baseline is today's pipeline (Tidy pre-pass + marked with `breaks: false`) wrapped in the same contract.
