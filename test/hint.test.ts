import { describe, expect, test } from "bun:test";
import { default as unhappyIndex, ALL_TARGETS, WATCHES, hintsFor } from "../pi-unhappy-index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("hintsFor", () => {
  test("cat fires only the read hint", () => {
    for (const cmd of ["cat /etc/hostname", "echo hi | cat", "cat > out.md <<'EOF'\nbody\nEOF"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("read files with `cat`");
      expect(hints[0]).toContain("`read`");
      expect(hints[0]).not.toContain("`edit`");
      expect(hints[0]).not.toContain("`grep`");
    }
  });

  test("head and tail also fire the read hint", () => {
    for (const cmd of ["head -50 log.txt", "tail -n 20 app.log", "tail -f /var/log/syslog"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("`read`");
    }
  });

  test("sed -i and perl -i fire the edit hint, plain filters do not", () => {
    for (const cmd of [
      "sed -i 's/foo/bar/' config.yaml",
      "sed -i.bak 's/foo/bar/' f.txt",
      "sed --in-place 's/a/b/' f",
      "perl -i -pe 's/a/b/' f.txt",
      "perl -pi -e 's/a/b/' f.txt",
      "perl -pin -e 's/a/b/' f.txt",
    ]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("edit files in place");
      expect(hints[0]).toContain("`edit`");
    }
    for (const cmd of ["echo x | sed s/a/b/", "sed -n '1,20p' file", "perl -pe 's/a/b/' in > out"]) {
      expect(hintsFor(cmd)).toEqual([]);
    }
  });

  test("tee and dd of= fire the write hint, plain filters do not", () => {
    for (const cmd of ["echo hi | tee out.txt", "tee -a append.log", "dd if=/dev/zero of=f bs=1M count=1"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("create or overwrite files");
      expect(hints[0]).toContain("`write`");
    }
    expect(hintsFor("dd if=f")).toEqual([]);
    expect(hintsFor("docker ps | wc -l")).toEqual([]); // no tee/dd at all
  });

  test("grep and rg fire only the search hint", () => {
    for (const cmd of ["grep -rn TODO src", "git grep fixpoint", "rg -n 'foo bar' src/", "ps aux | grep node"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("search files with `grep` or `rg`");
      expect(hints[0]).toContain("`grep` tool");
      expect(hints[0]).not.toContain("`read`");
    }
  });

  test("find and fd fire only the find hint", () => {
    for (const cmd of ["find src -name '*.ts'", "fd ts src/", "find . -maxdepth 2 -type d"]) {
      const hints = hintsFor(cmd);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toContain("search for files with `find` or `fd`");
      expect(hints[0]).toContain("`find` tool");
    }
    expect(hintsFor("fdisk -l")).toEqual([]);
  });

  test("ls fires the ls hint", () => {
    const hints = hintsFor("ls -la src/");
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("list directories with `ls`");
    expect(hints[0]).toContain("`ls` tool");
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

  test("a command matching several watches gets one hint per watch", () => {
    expect(hintsFor("cat data.csv | grep header")).toHaveLength(2);
    expect(hintsFor("python3 script.py && rg TODO")).toHaveLength(2);
    expect(hintsFor("find . -name '*.log' | xargs tail -1")).toHaveLength(2);
    expect(hintsFor("ps aux | grep node | tee /tmp/ps.txt")).toHaveLength(2);
  });

  test("does not fire on word fragments", () => {
    expect(hintsFor("echo category")).toEqual([]);
    expect(hintsFor("concat a b")).toEqual([]);
    expect(hintsFor("echo grepapp")).toEqual([]);
    expect(hintsFor("egrep a b")).toEqual([]);
    expect(hintsFor("borg backup /srv")).toEqual([]);
    expect(hintsFor("printf '%s' headset")).toEqual([]);
    expect(hintsFor("npm run build")).toEqual([]);
    expect(hintsFor("git commit -m 'x'")).toEqual([]);
  });

  test("non-string input is safe", () => {
    expect(hintsFor(undefined)).toEqual([]);
    expect(hintsFor(42)).toEqual([]);
  });
});

describe("arming from the active toolset", () => {
  test("without an active set, every watch is armed (standalone use)", () => {
    expect(hintsFor("cat x")).toHaveLength(1);
    expect(hintsFor("ls -la")).toHaveLength(1);
    expect(hintsFor("rg x")).toHaveLength(1);
  });

  test("an empty active set arms nothing", () => {
    expect(hintsFor("cat x", [])).toEqual([]);
    expect(hintsFor("rg x", [])).toEqual([]);
  });

  test("a watch is armed only while at least one of its targets is active", () => {
    const full = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    expect(hintsFor("rg TODO", full)).toHaveLength(1);
    // grep inactive: pi's own rules sanction bash rg then — no hint, no nudge to a dead tool
    expect(hintsFor("rg TODO", ["read", "bash", "edit", "write", "find"])).toEqual([]);
    expect(hintsFor("cat x", ["bash", "grep"])).toEqual([]);
    expect(hintsFor("cat x", ["read", "bash"])).toHaveLength(1);
  });

  test("reminders name only the active targets of a multi-target watch", () => {
    const both = hintsFor("python3 script.py", ["read", "edit", "bash"])[0];
    expect(both).toContain("`read` tool to read and the `edit` tool to edit");

    const readOnly = hintsFor("python3 script.py", ["read", "bash"])[0];
    expect(readOnly).toContain("`read` tool to read");
    expect(readOnly).not.toContain("`edit` tool");

    const editOnly = hintsFor("python3 script.py", ["edit", "bash"])[0];
    expect(editOnly).toContain("`edit` tool to edit");
    expect(editOnly).not.toContain("`read` tool");

    expect(hintsFor("python3 script.py", ["bash"])).toEqual([]);
  });
});

describe("WATCHES", () => {
  test("one watch per pre-configured tool, plus python for read+edit", () => {
    expect(WATCHES).toHaveLength(7);
    const byTargets = WATCHES.map((w) => w.targets.join("+"));
    expect(byTargets).toEqual(["read", "edit", "write", "grep", "find", "ls", "read+edit"]);
  });

  test("ALL_TARGETS covers every configured tool the extension can nudge toward", () => {
    expect(ALL_TARGETS).toEqual(["read", "edit", "write", "grep", "find", "ls"]);
  });

  test("every watch matches something", () => {
    const probes: Record<string, string> = {
      read: "cat x",
      edit: "sed -i x",
      write: "tee x",
      grep: "grep x",
      find: "find x",
      ls: "ls x",
      "read+edit": "python x",
    };
    for (const watch of WATCHES) {
      expect(watch.trigger.test(probes[watch.targets.join("+")])).toBe(true);
      expect(watch.offense).toMatch(/^[\w` ,+/-]+$/);
    }
  });

  test("every message names its replacement tools", () => {
    const all = ALL_TARGETS;
    for (const hints of [
      hintsFor("cat x", all),
      hintsFor("sed -i x", all),
      hintsFor("tee x", all),
      hintsFor("grep x", all),
      hintsFor("find x", all),
      hintsFor("ls x", all),
      hintsFor("python x", all),
    ]) {
      expect(hints[0]).toMatch(/Use the `[\w]+` tool/);
    }
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
function load(active: string[] = ALL_TARGETS): {
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

    const second = (await onToolResult(baseEvent("rg pattern src/")))!.content;
    expect(second[0].text).toContain("[unhappy=2]");
  });

  test("a command matching several watches counts as one catch, tag on the first line", async () => {
    const onToolResult = load().handlers.get("tool_result")!;
    const content = (await onToolResult(baseEvent("cat data.csv | grep header")))!.content;
    expect(content).toHaveLength(3);
    expect(content[0].text).toContain("[unhappy=1]");
    expect(content[1].text).not.toContain("[unhappy=");
    expect(content[2].text).toBe("file contents");
  });

  test("clean commands do not bump the index", async () => {
    const onToolResult = load().handlers.get("tool_result")!;
    expect(await onToolResult(baseEvent("echo hello"))).toBeUndefined();
    expect(await onToolResult(baseEvent("git status -sb"))).toBeUndefined();

    const content = (await onToolResult(baseEvent("grep -rn TODO src")))!.content;
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
    const { handlers, setActive } = load(["read", "bash", "edit", "write", "grep", "find"]);
    const onToolResult = handlers.get("tool_result")!;

    const caught = (await onToolResult(baseEvent("rg TODO src")))!.content;
    expect(caught[0].text).toContain("[unhappy=1]");

    // grep tool deactivated: bash rg is sanctioned now — no hint, no bump
    setActive(["read", "bash", "edit", "write", "find"]);
    expect(await onToolResult(baseEvent("rg TODO src"))).toBeUndefined();

    // read still active: cat still gets caught, index unchanged by the skipped rg
    const caught2 = (await onToolResult(baseEvent("cat /etc/hostname")))!.content;
    expect(caught2[0].text).toContain("[unhappy=2]");
  });

  test("a missing getActiveTools arms everything, like the pre-toolset behavior", async () => {
    const handlers = new Map<string, Handler>();
    unhappyIndex({
      on: (name: string, handler: Handler) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    const content = (await handlers.get("tool_result")!(baseEvent("ls -la")))!.content;
    expect(content[0].text).toContain("[unhappy=1]");
    expect(content[0].text).toContain("`ls` tool");
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
