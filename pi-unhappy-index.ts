/**
 * pi-unhappy-index — a minimal pi coding agent extension.
 *
 * When a bash command mentions a tool-substitution candidate, prepend one
 * short reminder per matched trigger group to the tool result so the model
 * sees it. Three hints, one per group:
 *
 *   cat        → hint: Do not read files with `cat`. Use the `read` tool to read.
 *   python     → hint: Do not read or edit files with `python`. Use the `read` tool to read and the `edit` tool to edit.
 *   grep / rg  → hint: Do not search files with `grep` or `rg`. Use the `grep` tool to search.
 *
 * Getting caught also bumps the unhappy index: the first reminder line
 * gets an `[unhappy=N]` tag prepended, where N is the number of catches so
 * far this session (a command matching several groups still counts as one
 * catch). The index lives in memory — it resets on session start, on /reload,
 * and whenever the pi process restarts. No command analysis beyond the trigger
 * regexes, on purpose: a false trigger costs one line of tokens and nothing
 * else — the command still runs and its output is preserved.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface Hint {
  /** Matched against the bash command; a match prepends `message`. */
  trigger: RegExp;
  /** The reminder line; the hook prepends the `[unhappy=N]` tag to the first one when caught. */
  message: string;
}

/** One hint per trigger group; array order is the prepend order. */
export const HINTS: Hint[] = [
  {
    trigger: /\bcat\b/,
    message: "hint: Do not read files with `cat`. Use the `read` tool to read.",
  },
  {
    trigger: /\bpython3?\b/,
    message:
      "hint: Do not read or edit files with `python`. Use the `read` tool to read and the `edit` tool to edit.",
  },
  {
    trigger: /\bgrep\b|\brg\b/,
    message: "hint: Do not search files with `grep` or `rg`. Use the `grep` tool to search.",
  },
];

/** The reminder lines this command deserves, in HINTS order. */
export function hintsFor(command: unknown): string[] {
  if (typeof command !== "string") return [];
  return HINTS.filter((hint) => hint.trigger.test(command)).map((hint) => hint.message);
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
    const hints = hintsFor(command);
    if (hints.length === 0) return undefined;

    unhappy += 1; // caught: one bump per command, whatever the group count
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
