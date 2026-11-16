# Changelog

## [0.2.1]

- python routes back to `edit` only (was read+edit): its real target is
  scripted file mutation — reading through python is usually legitimate
  data processing that no dedicated tool replaces. The watch fires only
  while the edit tool is active, and reads "Do not edit files with
  `python`. Use the `edit` tool to edit." at all times, with no more
  conditional tool naming.

## [0.2.0]

Toolset-aware upgrade. The extension now watches every pre-configured tool,
not just read/edit/grep:

- New watches: `head`/`tail` → read, `sed -i`/`perl -i` → edit,
  `tee`/`dd of=` → write, `find`/`fd` → find, `ls` → ls. The python hint
  (read+edit) and the grep/rg hint are unchanged.
- Watches arm from the live toolset: each result re-checks
  `pi.getActiveTools()`, and a watch fires only while at least one of its
  target tools is active. Tools removed via `defaultTools`, `--tools`, or
  `setActiveTools` stop producing hints, and multi-target hints name only
  the tools that remain. With no `getActiveTools()` on the running core,
  everything arms as before.
- Unhappy index behavior is unchanged: one bump per caught command, reset
  on session start, `/reload`, or restart.

## [0.1.0]

Initial release: bash results caught using `cat`, `python`, or `grep`/`rg`
get a one-line nudge back to the matching tool, and every catch bumps the
`[unhappy=N]` index.
