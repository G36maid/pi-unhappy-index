# pi-unhappy-index

A minimal pi coding agent extension. When a bash command involves `cat`,
`python`, `grep`, or `rg`, the extension prepends one reminder per matched
trigger group to the tool result so the model sees it. Three separate
hints, one per group:

```
hint: Do not read files with `cat`. Use the `read` tool to read.
hint: Do not read or edit files with `python`. Use the `read` tool to read and the `edit` tool to edit.
hint: Do not search files with `grep` or `rg`. Use the `grep` tool to search.
```

Each hint states its own rule directly and names the replacement tool, so
the model routes itself (python can read or write, so its hint names both
`read` and `edit`). A command matching several groups gets one line per
group. No command analysis beyond the trigger regexes, on purpose: a false
trigger costs one line of tokens and nothing else — the command still runs
and its output is preserved.

Getting caught also bumps the unhappy index: the first reminder line starts
with `[unhappy=N]`, where N is the number of catches so far this session.
The number is the fun part — and a visible streak the model can read.

## How it works

A single `tool_result` hook. The event already carries both the command
(`event.input.command`) and the result content, so no cross-event state is
needed. The handler runs the command through `hintsFor`, which tests the
`HINTS` table (one entry per trigger group) and returns the matching
reminder lines; each is prepended as its own text block, and the original
output follows untouched. The first block carries the `[unhappy=N]` tag.

The unhappy index is a plain in-memory counter: bumped once per caught
command (multi-group matches count as one catch), reset on `session_start`,
`/reload`, or a process restart. Nothing is persisted.

Skipped on purpose:

- failed commands (`isError`) — the model already got an error
- nested calls (`parentToolCallId` set) — those results feed a script, not
  the model

## Install

```
ln -sf "$(pwd)/pi-unhappy-index.ts" ~/.pi/agent/extensions/pi-unhappy-index.ts
```

Restart pi or run `/reload`.

## Test

```
bun test test/hint.test.ts
```
