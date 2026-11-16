# Changelog

## [0.3.0]

Back to the original shape, minus grep — exactly two watches remain:

- `cat` → read
- `python` → edit (the heredoc after an edit wall; the reason this
  extension exists)

Removed the grep/rg, head/tail, sed -i/perl, tee/dd, find/fd, and ls
watches added in 0.2.0. Session data said why: piped grep is the happy
path (verification half of the edit loop), head/tail mostly truncate
output, sed is mostly range reads, ls does not affect model behavior, and
happy usage cannot be enumerated — a minimal list keeps `[unhappy=N]`
counting the thing that matters. Arming from the live toolset stays.

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
