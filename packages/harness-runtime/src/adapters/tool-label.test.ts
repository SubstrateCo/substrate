import { toolInput, toolLabel } from "./tool-label.ts";
import { expect, test } from "bun:test";

/** Native input as harnesses send it: JSON fields of any type, or not an object at all. */
type NativeInput = { [key: string]: string | number } | string;

const label = (name: string, input?: NativeInput) => toolLabel(name, toolInput.parse(input));

test("workspace tools use their titles under any harness prefix", () => {
  expect(label("list_tasks")).toBe("List tasks");
  expect(label("mcp__substrate__list_projects")).toBe("List projects");
  expect(label("substrate_create_task")).toBe("Create task");
});

test("code-mode calls name the workspace tools the code calls, once each", () => {
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
  expect(label("mcp__github__createPullRequest", "not an object")).toBe("Create pull request");
});

test("long labels are cut to one short line", () => {
  const long = label("bash", { command: "x".repeat(500) });
  expect(long.length).toBe(120);
  expect(long.endsWith("…")).toBe(true);
});
