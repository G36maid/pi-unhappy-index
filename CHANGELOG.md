# Changelog

## [0.2.1]

- python is classified under `edit`: any `python`/`python3` in a bash
  command counts as an edit substitution — one hint, one unhappy bump —
  exactly like every other watch. (Previously it pointed at read+edit
  together.)

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
