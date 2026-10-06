import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema } from "../src/lib/validation.js";

function parseCommands(input: unknown) {
  const result = updateProfileSchema.safeParse({ terminalCommands: input });
  return result;
}

describe("terminalCommandsSchema", () => {
  test("accepts a valid command with output only", () => {
    const result = parseCommands([{ command: "invite", output: "Join our Discord!" }]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "expected success");
    if (result.success) {
      assert.deepEqual(result.data.terminalCommands, [{ command: "invite", output: "Join our Discord!" }]);
    }
  });

  test("accepts a command with a http(s) url", () => {
    const result = parseCommands([{ command: "site", output: "Check this out", url: "https://example.com" }]);
    assert.ok(result.success);
  });

  test("accepts a command with a description", () => {
    const result = parseCommands([
      { command: "invite", output: "Join https://discord.gg/foo", description: "Get a Discord invite" },
    ]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "expected success");
    if (result.success) {
      assert.deepEqual(result.data.terminalCommands, [
        { command: "invite", output: "Join https://discord.gg/foo", description: "Get a Discord invite" },
      ]);
    }
  });

  test("optional description is omitted when absent and sanitized when present", () => {
    const result = parseCommands([
      { command: "a", output: "x" },
      { command: "b", output: "y", description: "  Says <hi> to {all}  " },
    ]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.deepEqual(result.data.terminalCommands, [
        { command: "a", output: "x" },
        { command: "b", output: "y", description: "Says hi to all" },
      ]);
    }
  });

  test("rejects an oversized description", () => {
    const result = parseCommands([{ command: "x", output: "y", description: "d".repeat(121) }]);
    assert.ok(!result.success);
  });

  test("accepts a command with a mailto url", () => {
    const result = parseCommands([{ command: "mail", output: "Email me", url: "mailto:hi@example.com" }]);
    assert.ok(result.success);
  });

  test("accepts a plain handle url (copied by the terminal)", () => {
    const result = parseCommands([{ command: "gh", output: "Fork me", url: "@freecodecamp" }]);
    assert.ok(result.success);
  });

  test("lowercases and sanitizes the command name and output", () => {
    const result = parseCommands([{ command: "GiThUb", output: "Say <hi> to {everyone}" }]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.deepEqual(result.data.terminalCommands, [{ command: "github", output: "Say hi to everyone" }]);
    }
  });

  test("rejects characters outside the allowlist in the command name", () => {
    const result = parseCommands([{ command: "bad command!", output: "nope" }]);
    assert.ok(!result.success);
  });

  test("rejects empty output", () => {
    const result = parseCommands([{ command: "x", output: "" }]);
    assert.ok(!result.success);
  });

  test("rejects duplicate command names", () => {
    const result = parseCommands([
      { command: "ping", output: "pong" },
      { command: "PING", output: "pong again" },
    ]);
    assert.ok(!result.success);
  });

  test("rejects more than 12 commands", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ command: `cmd${i}`, output: "x" }));
    const result = parseCommands(many);
    assert.ok(!result.success);
  });

  test("rejects a javascript: url", () => {
    const result = parseCommands([{ command: "evil", output: "nope", url: "javascript:alert(1)" }]);
    assert.ok(!result.success, "javascript: target must be rejected");
  });

  test("rejects an oversized output", () => {
    const result = parseCommands([{ command: "x", output: "a".repeat(301) }]);
    assert.ok(!result.success);
  });

  test("rejects storage of non-array value", () => {
    const result = parseCommands("not-an-array");
    assert.ok(!result.success);
  });
});