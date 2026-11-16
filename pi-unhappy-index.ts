/**
 * pi-unhappy-index — a minimal pi coding agent extension.
 *
 * Two watches, one nudge each:
 *
 *   cat      → hint: Do not read files with `cat`. Use the `read` tool to read.
 *   python   → hint: Do not edit files with `python`. Use the `edit` tool to edit.
 *
 * The python watch is the point: when the edit tool hits a wall (exact
 * content match, stale after format/lint), the model reaches for a python
 * heredoc, edits markdown badly, stops using edit for the rest of the
 * session, and chains straight into git commit. Catching the heredoc is
 * catching the loop at its head.
 *
 * That is the whole feature, and the list stays at two on purpose. It is
 * not enforcement — on Linux any of this can be bypassed, and the set of
 * bash usages that would actually make the owner happy cannot be
 * enumerated, so there is nothing precise to implement. A false trigger
 * costs one line of tokens; a missing trigger costs nothing. The only
 * output is expression: each caught command gets its reminder prepended,
 * with an `[unhappy=N]` tag on the first line, N = catches so far this
 * session. A minimal list keeps that counter counting the thing that
 * matters.
 *
 * Watches arm from the live toolset: each result re-checks
 * `pi.getActiveTools()`, and a watch only fires while its target tool is
 * active — pi's own rules sanction bash for file operations when the
 * dedicated tools are absent, and a hint pointing at a tool the model
 * cannot call is noise. If the running core exposes no `getActiveTools()`,
 * both watches arm. The index lives in memory: reset on session start,
 * /reload, or process restart. No command analysis beyond the trigger
 * regexes.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface Watch {
  /** The pi tool this watch routes back to; armed while it is active. */
  target: string;
  /** Matched against the bash command; a match fires the reminder. */
  trigger: RegExp;
  /** What the command was doing in the shell instead. */
  offense: string;
}

/** One watch per crime: cat stands in for read, python (heredoc after an edit wall) for edit. */
export const WATCHES: Watch[] = [
  {
    target: "read",
    trigger: /\bcat\b/,
    offense: "read files with `cat`",
  },
  {
    target: "edit",
    trigger: /\bpython3?\b/,
    offense: "edit files with `python`",
  },
];

/** Per-tool purpose, spelled out at the end of each reminder. */
const PURPOSE: Record<string, string> = {
  read: "to read",
  edit: "to edit",
};

/**
 * The reminder lines this command deserves, in WATCHES order, from armed
 * watches only. Without `activeTools` both watches arm; with a set (even
 * empty) a watch fires only when its target is in it.
 */
export function hintsFor(command: unknown, activeTools?: Iterable<string>): string[] {
  if (typeof command !== "string") return [];
  const active = new Set(activeTools ?? WATCHES.map((w) => w.target));
  return WATCHES.filter((w) => active.has(w.target))
    .filter((w) => w.trigger.test(command))
    .map((w) => `hint: Do not ${w.offense}. Use the \`${w.target}\` tool ${PURPOSE[w.target]}.`);
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
