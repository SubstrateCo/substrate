import {
  parseHarnessCommand,
  parseLocalConfiguration,
  trustedHarnessSender,
} from "./harness-bridge.ts";
import { expect, test } from "bun:test";

test("IPC rejects subframes, other windows, and untrusted origins", () => {
  const mainFrame = { url: "https://desktop.example.com/settings" };
  const contents = { mainFrame };
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(true);
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: { url: mainFrame.url } },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
  expect(
    trustedHarnessSender(
      { sender: {}, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
  mainFrame.url = "https://attacker.example.com";
  expect(
    trustedHarnessSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
});

test("commands cannot smuggle paths or catalog configuration", () => {
  expect(() =>
    parseHarnessCommand({
      type: "start",
      organizationId: "org",
      agentId: "agent",
      cwd: "C:/other",
    }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({ type: "configure", organizationId: "org", agents: [] }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({
      type: "prompt",
      organizationId: "org",
      sessionId: "session",
      text: "x".repeat(100_001),
    }),
  ).toThrow();
});

test("local configuration rejects paths, traversal, and embedded credentials", () => {
  expect(() =>
    parseLocalConfiguration("scanConfiguration", {
      organizationId: "org",
      harness: "codex",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("scanConfiguration", {
      organizationId: "org",
      agentId: "../agent",
      harness: "codex",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("deleteSkill", {
      organizationId: "org",
      agentId: "agent-1",
      harness: "codex",
      id: "../notes",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("scanConfiguration", {
      organizationId: "org",
      agentId: "agent-1",
      harness: "codex",
      directory: "C:/other",
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("saveMcpServer", {
      organizationId: "org",
      agentId: "agent-1",
      harness: "codex",
      server: {
        id: "server",
        name: "Server",
        transport: "stdio",
        command: "server",
        environment: { API_KEY: "secret" },
      },
    }),
  ).toThrow();
  expect(() =>
    parseLocalConfiguration("saveMcpServer", {
      organizationId: "org",
      agentId: "agent-1",
      harness: "codex",
      server: {
        id: "server",
        name: "Server",
        transport: "http",
        url: "https://user:password@example.com",
      },
    }),
  ).toThrow();
});
