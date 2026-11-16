# pi-unhappy-index

A minimal pi coding agent extension. Two watches, one nudge each:

```
hint: Do not read files with `cat`. Use the `read` tool to read.
hint: Do not edit files with `python`. Use the `edit` tool to edit.
```

The python watch is the point: when the edit tool hits a wall (exact
content match, stale after format/lint), the model reaches for a python
heredoc, edits markdown badly, stops using edit for the rest of the
session, and chains straight into git commit. Catching the heredoc is
catching the loop at its head.

Getting caught bumps the unhappy index: the first reminder line starts
with `[unhappy=N]`, where N is the number of catches so far this session.

## Why only two watches

This is not enforcement — on Linux any of it can be bypassed, and the set
of bash usages that would actually be the right call (piped grep for
verification, head/tail on logs, sed for range reads, ls, find) cannot be
enumerated. So the list stays minimal: a false trigger costs one line of
tokens and is itself a small expression of displeasure, while every extra
watch dilutes the counter until it counts nothing in particular. Keep the
list at two and `[unhappy=N]` mostly counts the thing that matters.

## Toolset-aware arming

Each `tool_result` re-checks `pi.getActiveTools()`; a watch fires only
while its target tool is active. When `read` or `edit` is removed from the
toolset, pi's own rules sanction bash for those operations, and a hint
pointing at a tool the model cannot call is just noise. If the running
core exposes no `getActiveTools()`, both watches arm.

## How it works

A single `tool_result` hook. The command (`event.input.command`) runs
through `hintsFor`, matching the two watch regexes; each reminder is
prepended as its own text block, original output untouched, `[unhappy=N]`
on the first line. In-memory counter: reset on `session_start`, `/reload`,
or process restart. Skipped on purpose: failed commands (`isError`),
nested calls (`parentToolCallId` — results feed a script, not the model),
and non-bash tools.

## Install

As a pi package:

```
pi pm add git:github.com/G36maid/pi-unhappy-index
```

Or symlink the extension directly:

```
ln -sf "$(pwd)/pi-unhappy-index.ts" ~/.pi/agent/extensions/pi-unhappy-index.ts
```

Restart pi or run `/reload`.

## Test

```
bun test test/hint.test.ts
```
