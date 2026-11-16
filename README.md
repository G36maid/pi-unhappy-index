# read-edit-hint

A minimal pi coding agent extension. When a bash command involves `cat` or
`python`, the extension prepends one fixed line to the tool result so the
model sees it:

```
read-edit-hint: If you are reading, you must use the read tool. If you are editing, you must use the edit tool.
```

The message is deliberately conditional. The model knows whether it is
reading or editing, so it routes itself to the right tool. No command
analysis beyond a trigger regex, on purpose: a false trigger costs one line
of tokens and nothing else — the command still runs and its output is
preserved.

## How it works

A single `tool_result` hook. The event already carries both the command
(`event.input.command`) and the result content, so no cross-event state is
needed. On a trigger, the handler returns a content patch with the reminder
prepended; the original output follows untouched.

Skipped on purpose:

- failed commands (`isError`) — the model already got an error
- nested calls (`parentToolCallId` set) — those results feed a script, not
  the model

## Install

```
ln -sf "$(pwd)/read-edit-hint.ts" ~/.pi/agent/extensions/read-edit-hint.ts
```

Restart pi or run `/reload`.

## Test

```
bun test test/hint.test.ts
```
