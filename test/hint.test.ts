import { describe, expect, test } from "bun:test";
import { MESSAGE, shouldHint } from "../read-edit-hint";

describe("shouldHint", () => {
  test("fires on cat", () => {
    expect(shouldHint("cat /etc/hostname")).toBe(true);
    expect(shouldHint("echo hi | cat")).toBe(true);
    expect(shouldHint("cat > out.md <<'EOF'\nbody\nEOF")).toBe(true);
  });

  test("fires on python in any common spelling", () => {
    expect(shouldHint("python3 -c 'print(1)'")).toBe(true);
    expect(shouldHint("python - <<'EOF'\nprint(1)\nEOF")).toBe(true);
    expect(shouldHint("/usr/bin/python3 script.py")).toBe(true);
    expect(shouldHint("python3.11 -m venv .venv")).toBe(true);
  });

  test("does not fire on word fragments", () => {
    expect(shouldHint("echo category")).toBe(false);
    expect(shouldHint("concat a b")).toBe(false);
    expect(shouldHint("npm run build")).toBe(false);
    expect(shouldHint("git commit -m 'x'")).toBe(false);
  });

  test("non-string input is safe", () => {
    expect(shouldHint(undefined)).toBe(false);
    expect(shouldHint(42)).toBe(false);
  });
});

describe("MESSAGE", () => {
  test("names both required tools", () => {
    expect(MESSAGE).toContain("read tool");
    expect(MESSAGE).toContain("edit tool");
  });
});
