/**
 * read-edit-hint — a minimal pi coding agent extension.
 *
 * When a bash command involves `cat` or `python`, prepend one fixed line to
 * the tool result so the model sees it:
 *
 *   read-edit-hint: Do not read or edit files with `cat` or `python`.
 *   Use the `read` tool to read and the `edit` tool to edit.
 *
 * The message states the rule directly, but routing is still up to the
 * model: it knows its own intent, so it picks read or edit accordingly.
 * No command analysis beyond the
 * trigger regex, on purpose. A false trigger costs one line of tokens and
 * nothing else — the command still runs and its output is preserved.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TRIGGER = /\bcat\b|\bpython3?\b/;

export const MESSAGE =
  "read-edit-hint: Do not read or edit files with `cat` or `python`. Use the `read` tool to read and the `edit` tool to edit.";

export function shouldHint(command: unknown): boolean {
  return typeof command === "string" && TRIGGER.test(command);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    // only nudge real, successful bash calls surfaced to the model
    if (event.toolName !== "bash" || event.isError) return undefined;
    if ((event as { parentToolCallId?: string }).parentToolCallId) return undefined; // nested call: result feeds a script
    const command = (event.input as Record<string, unknown> | undefined)?.command;
    if (!shouldHint(command)) return undefined;

    const reminder: { type: "text"; text: string } = { type: "text", text: MESSAGE };
    return {
      content: [reminder, ...event.content],
      ...(event.structuredContent !== undefined ? { structuredContent: event.structuredContent } : {}),
    };
  });
}
