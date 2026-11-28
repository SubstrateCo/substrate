import {
  toolCallLabel,
  toolInput,
  toolLabel,
  type HostTools,
  type ToolCall,
} from "./tool-label.ts";
import { expect, test } from "bun:test";

type NativeInput = { [key: string]: string | number } | string;

const titles = new Map([
  ["list_tasks", "List tasks"],
  ["list_projects", "List projects"],
  ["create_task", "Create task"],
]);
const host: HostTools = { server: "substrate", title: (name) => titles.get(name) };

const label = (name: string, input?: NativeInput) =>
  toolLabel(name, toolInput.parse(input), [], host);

test("host tools use their titles under any harness prefix", () => {
  expect(label("list_tasks")).toBe("List tasks");
  expect(label("mcp__substrate__list_projects")).toBe("List projects");
  expect(label("substrate_create_task")).toBe("Create task");
});

test("without host tools, the same names read as any other server's tools", () => {
  expect(toolLabel("mcp__substrate__list_projects")).toBe("substrate · List projects");
});

test("code-mode calls name the host tools the code calls, once each", () => {
  const code = `
    const projects = await tools["substrate"].list_projects({});
    for (const p of projects) await tools.substrate.list_tasks({ projectId: p.id });
    await tools["substrate"]["list_tasks"]({});
    await search({ query: "tasks" });
  `;
  expect(label("execute", { code })).toBe("List projects, List tasks");
  expect(label("execute", { code: "return 1 + 1" })).toBe("Run code");
});

test("common native tools show what they acted on", () => {
  expect(label("skill", { name: "tasks" })).toBe("Use skill · tasks");
  expect(label("Bash", { command: "bun test\nbun run lint" })).toBe("Run · bun test");
  expect(label("bash", { command: "ls", description: "List files" })).toBe("Run · List files");
  expect(label("Read", { file_path: "C:\\repo\\src\\README.md" })).toBe("Read · README.md");
  expect(label("webfetch", { url: "https://example.com/a?b=c" })).toBe("Fetch · example.com");
});

test("unknown tools and unusable input fall back to a readable name", () => {
  expect(label("skill")).toBe("Use skill");
  expect(label("skill", { name: 42 })).toBe("Use skill");
  expect(label("mcp__github__createPullRequest", "not an object")).toBe(
    "github · Create pull request",
  );
});

test("MCP tool identifiers read the same in every harness's form", () => {
  for (const name of [
    "mcp__substrate__list_projects",
    "mcp.substrate.list_projects",
    "Mcp.substrate.list_projects",
    "mcp/substrate/list_projects",
    "substrate.list_projects",
  ])
    expect(label(name)).toBe("List projects");
  expect(label("mcp.substrate.future_tool")).toBe("Future tool");
  expect(label("mcp__github__create_issue")).toBe("github · Create issue");
  expect(label("mcp.github.create_issue")).toBe("github · Create issue");
  expect(toolLabel("github_create_issue", {}, ["github"])).toBe("github · Create issue");
  expect(toolLabel("linear.list_issues", {}, ["linear"])).toBe("linear · List issues");
});

test("commands lose their shell wrapper", () => {
  expect(
    label("bash", {
      command: `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "bun test src"`,
    }),
  ).toBe("Run · bun test src");
  expect(label("shell", { command: "bash -lc 'git status'" })).toBe("Run · git status");
  expect(label("shell", { command: "cmd.exe /c dir /b" })).toBe("Run · dir /b");
  expect(label("shell", { command: "pwsh -NoProfile -c 'echo ''hi'''" })).toBe("Run · echo 'hi'");
  expect(label("shell", { command: "bun run lint -c config" })).toBe(
    "Run · bun run lint -c config",
  );
});

/** ACP rawInput: Codex sends command as an argv array. */
type AcpInput = { [key: string]: string | string[] };

const call = (title: string | undefined, kind: string | undefined, input?: AcpInput) => {
  const tool: ToolCall = { input: toolInput.parse(input) };
  if (title !== undefined) tool.title = title;
  if (kind !== undefined) tool.kind = kind;
  return toolCallLabel(tool, [], host);
};

test("ACP calls with a generic title read from their kind and input", () => {
  expect(
    call("terminal", "execute", {
      command: ["pwsh.exe", "-NoProfile", "-Command", "bun test src"],
      cwd: "C:\\repo",
    }),
  ).toBe("Run · bun test src");
  expect(call("Tool", "read", { path: "/repo/src/index.ts" })).toBe("Read · index.ts");
  expect(call("tool call", "search", { pattern: "toolLabel" })).toBe("Search files · toolLabel");
  expect(call(undefined, "fetch", { url: "https://example.com/x" })).toBe("Fetch · example.com");
  expect(call("", undefined)).toBe("Tool");
});

test("ACP command titles show the command without its wrapper", () => {
  expect(call("pwsh.exe -Command 'bun test src'", "execute")).toBe("Run · bun test src");
  expect(call("`git status`", "execute", { command: "git status" })).toBe("Run · git status");
  expect(call("`ls -la`", "execute")).toBe("Run · ls -la");
  expect(call("Run code", "execute")).toBe("Run code");
});

test("ACP identifier titles read as tool names; descriptive titles stay", () => {
  expect(call("mcp.substrate.list_projects", "other")).toBe("List projects");
  expect(call("mcp__github__create_issue", undefined)).toBe("github · Create issue");
  expect(call("Tool search", "other")).toBe("Tool search");
  expect(
    toolCallLabel({ name: "mcp__substrate__list_projects", title: "x", input: {} }, [], host),
  ).toBe("List projects");
});

test("long labels are cut to one short line", () => {
  const long = label("bash", { command: "x".repeat(500) });
  expect(long.length).toBe(120);
  expect(long.endsWith("…")).toBe(true);
});
