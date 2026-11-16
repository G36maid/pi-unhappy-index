import { describe, expect, test } from "bun:test";
import { default as unhappyIndex, WATCHES, hintsFor } from "../pi-unhappy-index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("hintsFor", () => {
  test("cat fires only the read hint", () => {
    for (const cmd of ["cat /etc/hostname", "echo hi | cat", "cat > out.md <<'EOF'\nbody\nEOF"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toBe("hint: Do not read files with `cat`. Use the `read` tool to read.");
    }
  });

  test("python fires only the edit hint, in any common spelling", () => {
    for (const cmd of [
      "python3 -c 'print(1)'",
      "python - <<'EOF'\nprint(1)\nEOF",
      "/usr/bin/python3 script.py",
      "python3.11 -m venv .venv",
    ]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toBe("hint: Do not edit files with `python`. Use the `edit` tool to edit.");
    }
  });

  test("nothing else is watched — grep, find, ls, head/tail, sed -i are the happy path", () => {
    for (const cmd of [
      "grep -rn TODO src",
      "rg pattern src/",
      "ps aux | grep node",
      "find src -name '*.ts'",
      "ls -la",
      "head -50 log.txt",
      "tail -n 20 app.log",
      "sed -i 's/a/b/' f",
      "echo x | tee out.txt",
    ]) {
      expect(hintsFor(cmd)).toEqual([]);
    }
  });

  test("a command matching both watches gets one hint per watch", () => {
    const hints = hintsFor("cat config.yaml && python3 fix.py");
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain("`read` tool to read");
    expect(hints[1]).toContain("`edit` tool to edit");
  });

  test("does not fire on word fragments", () => {
    expect(hintsFor("echo category")).toEqual([]);
    expect(hintsFor("concat a b")).toEqual([]);
    expect(hintsFor("borg backup /srv")).toEqual([]);
    expect(hintsFor("npm run build")).toEqual([]);
    expect(hintsFor("git commit -m 'x'")).toEqual([]);
  });

  test("non-string input is safe", () => {
    expect(hintsFor(undefined)).toEqual([]);
    expect(hintsFor(42)).toEqual([]);
  });
});

describe("arming from the active toolset", () => {
  test("without an active set, both watches arm (standalone use)", () => {
    expect(hintsFor("cat x")).toHaveLength(1);
    expect(hintsFor("python3 x")).toHaveLength(1);
  });

  test("an empty active set arms nothing", () => {
    expect(hintsFor("cat x", [])).toEqual([]);
    expect(hintsFor("python3 x", [])).toEqual([]);
  });

  test("a watch fires only while its target tool is active", () => {
    expect(hintsFor("cat x", ["read", "bash"])).toHaveLength(1);
    expect(hintsFor("cat x", ["bash"])).toEqual([]); // read absent: bash is sanctioned
    expect(hintsFor("python3 x", ["read", "bash"])).toEqual([]); // edit absent
    expect(hintsFor("python3 x", ["edit", "bash"])).toHaveLength(1);
  });
});

describe("WATCHES", () => {
  test("exactly two watches: cat -> read, python -> edit", () => {
    expect(WATCHES).toHaveLength(2);
    expect(WATCHES.map((w) => w.target)).toEqual(["read", "edit"]);
    expect(WATCHES[0].trigger.test("cat x")).toBe(true);
    expect(WATCHES[1].trigger.test("python3 x")).toBe(true);
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

/** Load the extension against a fake pi and return its registered handlers plus a loadout setter. */
function load(active: string[] = ["read", "edit", "bash"]): {
  handlers: Map<string, Handler>;
  setActive: (tools: string[]) => void;
} {
  const handlers = new Map<string, Handler>();
  let current = active;
  unhappyIndex({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    getActiveTools: () => current,
  } as unknown as ExtensionAPI);
  return { handlers, setActive: (tools: string[]) => void (current = tools) };
}

const baseEvent = (command?: string, extra: Partial<ToolResultEvent> = {}): ToolResultEvent => ({
  toolName: "bash",
  content: [{ type: "text", text: "file contents" }],
  ...(command !== undefined ? { input: { command } } : {}),
  ...extra,
});

describe("unhappy index", () => {
  test("increments per caught command and prepends the tag to the first hint line", async () => {
    const onToolResult = load().handlers.get("tool_result")!;

    const first = (await onToolResult(baseEvent("cat /etc/hostname")))!.content;
    expect(first).toHaveLength(2);
    expect(first[0].text).toContain("[unhappy=1]");
    expect(first[1].text).toBe("file contents");

    const second = (await onToolResult(baseEvent("python3 fix.py")))!.content;
    expect(second[0].text).toContain("[unhappy=2]");
  });

  test("a command matching both watches counts as one catch, tag on the first line", async () => {
    const onToolResult = load().handlers.get("tool_result")!;
    const content = (await onToolResult(baseEvent("cat config.yaml && python3 fix.py")))!.content;
    expect(content).toHaveLength(3);
    expect(content[0].text).toContain("[unhappy=1]");
    expect(content[1].text).not.toContain("[unhappy=");
    expect(content[2].text).toBe("file contents");
  });

  test("clean commands do not bump the index", async () => {
    const onToolResult = load().handlers.get("tool_result")!;
    expect(await onToolResult(baseEvent("echo hello"))).toBeUndefined();
    expect(await onToolResult(baseEvent("git status -sb"))).toBeUndefined();
    expect(await onToolResult(baseEvent("rg pattern src/"))).toBeUndefined();

    const content = (await onToolResult(baseEvent("cat /etc/hostname")))!.content;
    expect(content[0].text).toContain("[unhappy=1]"); // still the first catch
  });

  test("skips errors, nested calls, and non-bash without bumping", async () => {
    const onToolResult = load().handlers.get("tool_result")!;
    expect(await onToolResult(baseEvent("cat x", { isError: true }))).toBeUndefined();
    expect(await onToolResult(baseEvent("cat x", { parentToolCallId: "call_1/0" }))).toBeUndefined();
    expect(await onToolResult(baseEvent("cat x", { toolName: "read" }))).toBeUndefined();

    const content = (await onToolResult(baseEvent("cat y")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });

  test("arming follows the live loadout between calls", async () => {
    const { handlers, setActive } = load(["read", "edit", "bash"]);
    const onToolResult = handlers.get("tool_result")!;

    const caught = (await onToolResult(baseEvent("python3 - <<'EOF'\nopen('f','w').write('x')\nEOF")))!.content;
    expect(caught[0].text).toContain("[unhappy=1]");

    setActive(["read", "bash"]); // edit tool gone: python heredoc is sanctioned now
    expect(await onToolResult(baseEvent("python3 - <<'EOF'\nprint(1)\nEOF"))).toBeUndefined();

    const caught2 = (await onToolResult(baseEvent("cat /etc/hostname")))!.content;
    expect(caught2[0].text).toContain("[unhappy=2]");
  });

  test("a missing getActiveTools arms everything", async () => {
    const handlers = new Map<string, Handler>();
    unhappyIndex({
      on: (name: string, handler: Handler) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    const content = (await handlers.get("tool_result")!(baseEvent("python3 x")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });

  test("session_start resets the index", async () => {
    const { handlers } = load();
    const onToolResult = handlers.get("tool_result")!;
    const onSessionStart = handlers.get("session_start")!;

    await onToolResult(baseEvent("cat x"));
    await onSessionStart(baseEvent());

    const content = (await onToolResult(baseEvent("cat y")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });

  test("each load starts a fresh index", async () => {
    const firstRun = load().handlers.get("tool_result")!;
    await firstRun(baseEvent("cat x"));
    await firstRun(baseEvent("cat y"));

    const secondRun = load().handlers.get("tool_result")!; // a /reload gives a new module instance
    const content = (await secondRun(baseEvent("cat z")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
  });
});
