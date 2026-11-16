/**
 * pi-unhappy-index — a minimal pi coding agent extension.
 *
 * Watches bash results for commands that sneakily do, in the shell, what one
 * of pi's pre-configured tools exists to do, and prepends one short reminder
 * per caught watch so the model sees it. One watch per tool (read, edit,
 * write, grep, find, ls), with python classified under edit:
 *
 *   read        cat / head / tail        → Use the `read` tool to read.
 *   edit        sed -i / perl -i         → Use the `edit` tool to edit.
 *   edit        python                   → Use the `edit` tool to edit.
 *   write       tee / dd of=             → Use the `write` tool to write.
 *   grep        grep / rg                → Use the `grep` tool to search.
 *   find        find / fd                → Use the `find` tool to find.
 *   ls          ls                       → Use the `ls` tool to list.
 *
 * Watches arm from the live toolset, not a hardcoded list: every result
 * re-checks `pi.getActiveTools()`, and a watch is armed only while at least
 * one of its target tools is active. This mirrors pi's own system-prompt
 * rules, which sanction bash for file operations when the dedicated tools
 * are absent — pointing at a tool the model cannot call would be noise, and
 * an absent tool means nothing is being sneaked. It also keeps up with
 * dynamic loadouts (`setActiveTools`, package-registered tools) without a
 * reload. If the running core exposes no `getActiveTools()`, all watches
 * arm, matching the pre-toolset behavior.
 *
 * Getting caught bumps the unhappy index: the first reminder line gets an
 * `[unhappy=N]` tag prepended, where N is the number of catches so far this
 * session (a command matching several watches still counts as one catch).
 * The index lives in memory — it resets on session start, on /reload, and
 * whenever the pi process restarts. No command analysis beyond the trigger
 * regexes, on purpose: a false trigger costs one line of tokens and nothing
 * else — the command still runs and its output is preserved.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface Watch {
  /** Pi tools this watch routes back to; armed while at least one is active. */
  targets: string[];
  /** Matched against the bash command; a match fires the reminder. */
  trigger: RegExp;
  /** What the command was doing in the shell instead. */
  offense: string;
}

/** One watch per route back to a pre-configured tool; array order is the prepend order. */
export const WATCHES: Watch[] = [
  {
    targets: ["read"],
    trigger: /\b(?:cat|head|tail)\b/,
    offense: "read files with `cat`, `head`, or `tail`",
  },
  {
    targets: ["edit"],
    trigger:
      /\bsed\b[^|;&>]*\s(?:-i\b|--in-place\b)|\bperl\d*\b[^|;&>]*\s-(?:pin|pi|i)\b/,
    offense: "edit files in place with `sed` or `perl`",
  },
  {
    targets: ["edit"],
    trigger: /\bpython3?\b/,
    offense: "edit files with `python`",
  },
  {
    targets: ["write"],
    trigger: /\btee\b|\bdd\b[^|;&>]*\bof=/,
    offense: "create or overwrite files with `tee` or `dd`",
  },
  {
    targets: ["grep"],
    trigger: /\bgrep\b|\brg\b/,
    offense: "search files with `grep` or `rg`",
  },
  {
    targets: ["find"],
    trigger: /\bfind\b|\bfd\b/,
    offense: "search for files with `find` or `fd`",
  },
  {
    targets: ["ls"],
    trigger: /\bls\b/,
    offense: "list directories with `ls`",
  },
];

/** Per-tool purpose, spelled out at the end of each reminder. */
const PURPOSE: Record<string, string> = {
  read: "to read",
  edit: "to edit",
  write: "to write",
  grep: "to search",
  find: "to find",
  ls: "to list",
};

/** Every tool some watch points at; hintsFor arms all of them when the active set is unknown. */
export const ALL_TARGETS: string[] = [...new Set(WATCHES.flatMap((watch) => watch.targets))];

/**
 * The reminder lines this command deserves, in WATCHES order, from armed
 * watches only. Without `activeTools` every watch is armed; with a set (even
 * empty) only watches whose targets intersect it fire, and their reminders
 * name just the tools that are actually active.
 */
export function hintsFor(command: unknown, activeTools?: Iterable<string>): string[] {
  if (typeof command !== "string") return [];
  const active = new Set(activeTools ?? ALL_TARGETS);
  return WATCHES.filter((watch) => watch.targets.some((tool) => active.has(tool)))
    .filter((watch) => watch.trigger.test(command))
    .map((watch) => {
      const use = watch.targets
        .filter((tool) => active.has(tool))
        .map((tool) => `the \`${tool}\` tool ${PURPOSE[tool] ?? ""}`.trimEnd())
        .join(" and ");
      return `hint: Do not ${watch.offense}. Use ${use}.`;
    });
}

export default function (pi: ExtensionAPI) {
  let unhappy = 0; // catches so far this session

  pi.on("session_start", async () => {
    unhappy = 0;
  });

  pi.on("tool_result", async (event) => {
    // only nudge real, successful bash calls surfaced to the model
    if (event.toolName !== "bash" || event.isError) return undefined;
    if ((event as { parentToolCallId?: string }).parentToolCallId) return undefined; // nested call: result feeds a script
    const command = (event.input as Record<string, unknown> | undefined)?.command;
    // re-check per result: arming follows the live loadout
    const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : undefined;
    const hints = hintsFor(command, activeTools);
    if (hints.length === 0) return undefined;

    unhappy += 1; // caught: one bump per command, whatever the watch count
    const tag = `[unhappy=${unhappy}]`;
    const reminders = hints.map((text, i) => ({
      type: "text" as const,
      text: i === 0 ? `${tag} ${text}` : text,
    }));
    return {
      content: [...reminders, ...event.content],
      ...(event.structuredContent !== undefined ? { structuredContent: event.structuredContent } : {}),
    };
  });
}
