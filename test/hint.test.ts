import { describe, expect, test } from "bun:test";
import { default as unhappyIndex, HINTS, hintsFor } from "../pi-unhappy-index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("hintsFor", () => {
  test("cat fires only the cat hint", () => {
    for (const cmd of ["cat /etc/hostname", "echo hi | cat", "cat > out.md <<'EOF'\nbody\nEOF"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("Do not read files with `cat`");
      expect(hints[0]).toContain("`read`");
      expect(hints[0]).not.toContain("`edit`");
      expect(hints[0]).not.toContain("`grep`");
    }
  });

  test("python fires only the python hint, in any common spelling", () => {
    for (const cmd of [
      "python3 -c 'print(1)'",
      "python - <<'EOF'\nprint(1)\nEOF",
      "/usr/bin/python3 script.py",
      "python3.11 -m venv .venv",
    ]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("`python`");
      expect(hints[0]).toContain("`read`");
      expect(hints[0]).toContain("`edit`");
      expect(hints[0]).not.toContain("`grep`");
    }
  });

  test("grep and rg fire only the search hint", () => {
    for (const cmd of ["grep -rn TODO src", "git grep fixpoint", "rg -n 'foo bar' src/", "ps aux | grep node"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("Do not search files with `grep` or `rg`");
      expect(hints[0]).toContain("`grep` tool");
      expect(hints[0]).not.toContain("`read`");
    }
  });

  test("a command matching several groups gets one hint per group", () => {
    expect(hintsFor("cat data.csv | grep header")).toHaveLength(2);
    expect(hintsFor("python3 script.py && rg TODO")).toHaveLength(2);
  });

  test("does not fire on word fragments", () => {
    expect(hintsFor("echo category")).toEqual([]);
    expect(hintsFor("concat a b")).toEqual([]);
    expect(hintsFor("echo grepapp")).toEqual([]);
    expect(hintsFor("egrep a b")).toEqual([]);
    expect(hintsFor("borg backup /srv")).toEqual([]);
    expect(hintsFor("npm run build")).toEqual([]);
    expect(hintsFor("git commit -m 'x'")).toEqual([]);
  });

  test("non-string input is safe", () => {
    expect(hintsFor(undefined)).toEqual([]);
    expect(hintsFor(42)).toEqual([]);
  });
});

describe("HINTS", () => {
  test("three separate hints, one per trigger group", () => {
    expect(HINTS).toHaveLength(3);
    expect(HINTS.map((h) => h.trigger.test("cat x"))).toEqual([true, false, false]);
    expect(HINTS.map((h) => h.trigger.test("python3 -c 'x'"))).toEqual([false, true, false]);
    expect(HINTS.map((h) => h.trigger.test("rg x"))).toEqual([false, false, true]);
  });

  test("every message names its replacement tools", () => {
    expect(HINTS[0].message).toContain("`read`");
    expect(HINTS[1].message).toContain("`read`");
    expect(HINTS[1].message).toContain("`edit`");
    expect(HINTS[2].message).toContain("`grep`");
  });
});

// --- hook behavior: unhappy index ---

type TextBlock = { type: string; text: string };

type ToolResultEvent = {
  toolName: string;
  isError?: boolean;
  parentToolCallId?: string;
  input?: Record<string, unknown>;
  content: TextBlock[];
  structuredContent?: unknown;
};

type Handler = (event: ToolResultEvent, ctx?: unknown) => Promise<undefined | { content: TextBlock[] }>;

/** Load the extension against a fake pi and return its registered handlers. */
function load(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  unhappyIndex({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
  } as unknown as ExtensionAPI);
  return handlers;
}

const baseEvent = (command?: string, extra: Partial<ToolResultEvent> = {}): ToolResultEvent => ({
  toolName: "bash",
  content: [{ type: "text", text: "file contents" }],
  ...(command !== undefined ? { input: { command } } : {}),
  ...extra,
});

describe("unhappy index", () => {
  test("increments per caught command and prepends the tag to the first hint line", async () => {
    const onToolResult = load().get("tool_result")!;

    const first = (await onToolResult(baseEvent("cat /etc/hostname")))!.content;
    expect(first).toHaveLength(2);
    expect(first[0].text).toContain("[unhappy=1]");
    expect(first[1].text).toBe("file contents");

    const second = (await onToolResult(baseEvent("rg pattern src/")))!.content;
    expect(second[0].text).toContain("[unhappy=2]");
  });

  test("a command matching several groups counts as one catch, tag on the first line", async () => {
    const onToolResult = load().get("tool_result")!;
    const content = (await onToolResult(baseEvent("cat data.csv | grep header")))!.content;
    expect(content).toHaveLength(3);
    expect(content[0].text).toContain("[unhappy=1]");
    expect(content[1].text).not.toContain("[unhappy=");
    expect(content[2].text).toBe("file contents");
  });

  test("clean commands do not bump the index", async () => {
    const onToolResult = load().get("tool_result")!;
    expect(await onToolResult(baseEvent("ls -la"))).toBeUndefined();

    const content = (await onToolResult(baseEvent("grep -rn TODO src")))!.content;
    expect(content[0].text).toContain("[unhappy=1]"); // still the first catch
  });

  test("skips errors, nested calls, and non-bash without bumping", async () => {
    const onToolResult = load().get("tool_result")!;
    expect(await onToolResult(baseEvent("cat x", { isError: true }))).toBeUndefined();
    expect(await onToolResult(baseEvent("cat x", { parentToolCallId: "call_1/0" }))).toBeUndefined();
    expect(await onToolResult(baseEvent("cat x", { toolName: "read" }))).toBeUndefined();

    const content = (await onToolResult(baseEvent("cat y")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });

  test("session_start resets the index", async () => {
    const handlers = load();
    const onToolResult = handlers.get("tool_result")!;
    const onSessionStart = handlers.get("session_start")!;

    await onToolResult(baseEvent("cat x"));
    await onSessionStart(baseEvent());

    const content = (await onToolResult(baseEvent("cat y")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });

  test("each load starts a fresh index", async () => {
    const firstRun = load().get("tool_result")!;
    await firstRun(baseEvent("cat x"));
    await firstRun(baseEvent("cat y"));

    const secondRun = load().get("tool_result")!; // a /reload gives a new module instance
    const content = (await secondRun(baseEvent("cat z")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });
});
