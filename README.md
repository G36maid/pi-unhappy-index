# pi-unhappy-index

A minimal pi coding agent extension. When a bash command sneakily does, in
the shell, what one of pi's pre-configured tools exists to do, the extension
prepends one reminder per caught watch to the tool result so the model sees
it. One watch per route back to a tool (edit gets two: shell in-place and
python, whose real target is scripted file mutation):

```
hint: Do not read files with `cat`, `head`, or `tail`. Use the `read` tool to read.
hint: Do not edit files in place with `sed` or `perl`. Use the `edit` tool to edit.
hint: Do not edit files with `python`. Use the `edit` tool to edit.
hint: Do not create or overwrite files with `tee` or `dd`. Use the `write` tool to write.
hint: Do not search files with `grep` or `rg`. Use the `grep` tool to search.
hint: Do not search for files with `find` or `fd`. Use the `find` tool to find.
hint: Do not list directories with `ls`. Use the `ls` tool to list.
```

Each hint states its own rule directly and names the replacement tool, so
the model routes itself. A command matching several watches gets one line
per watch. No command analysis beyond the trigger regexes, on purpose: a
false trigger costs one line of tokens and nothing else — the command still
runs and its output is preserved.

Getting caught also bumps the unhappy index: the first reminder line starts
with `[unhappy=N]`, where N is the number of catches so far this session.
The number is the fun part — and a visible streak the model can read.

## Toolset-aware arming

The watch table is not hardcoded to a fixed toolset. Every `tool_result`
re-checks `pi.getActiveTools()`, and a watch is armed only while at least
one of its target tools is active. Consequences:

- **No pointing at dead tools.** pi's own system-prompt rules sanction bash
  for file operations when the dedicated tools are absent (`defaultTools`,
  `--tools`, or `setActiveTools` all respected). With `grep` inactive, an
  `rg` in bash is sanctioned — no hint fires, and the unhappy index does not
  move.
- **Hints stay truthful.** Reminders name only tools that are actually
  active; a watch pointing at several tools arms while any one of them is
  active and its reminder names just the active ones.
- **Dynamic loadouts work without a reload.** Package-registered tools and
  mid-session `setActiveTools` changes are picked up by the next result.

If the running core exposes no `getActiveTools()`, every watch arms,
matching the pre-toolset behavior.

The arming source is `getActiveTools()` rather than `getAllTools()` on
purpose: `getAllTools()` lists every registered tool including inactive ones
(a deactivated built-in stays registered), but only active tools are
callable by the model, so only they are worth naming in a hint.

## How it works

A single `tool_result` hook. The event already carries both the command
(`event.input.command`) and the result content, so no cross-event state is
needed. The handler re-reads the active toolset, runs the command through
`hintsFor`, which tests the `WATCHES` table (one entry per tool being routed
back to) and returns the matching reminder lines; each is prepended as its
own text block, and the original output follows untouched. The first block
carries the `[unhappy=N]` tag.

The unhappy index is a plain in-memory counter: bumped once per caught
command (multi-watch matches count as one catch), reset on `session_start`,
`/reload`, or a process restart. Nothing is persisted.

Skipped on purpose:

- failed commands (`isError`) — the model already got an error
- nested calls (`parentToolCallId` set) — those results feed a script, not
  the model
- `powershell` results — bash only; that is where the sneaking happens

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
