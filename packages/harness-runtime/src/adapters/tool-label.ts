import { mcpTools } from "@startup-os/contracts/harness/tools";

import { z } from "zod";

const maxLength = 120;

const workspaceTitles: ReadonlyMap<string, string> = new Map(
  Object.entries(mcpTools).map(([name, tool]) => [name, tool.title]),
);

const field = z.string().optional().catch(undefined);

/**
 * The native tool input fields that labels read. Native input is untyped JSON; a field of
 * another type, or input that is not an object, reads as missing.
 */
export const toolInput = z
  .object({
    code: field,
    name: field,
    skill: field,
    command: field,
    description: field,
    filePath: field,
    file_path: field,
    path: field,
    pattern: field,
    url: field,
    query: field,
  })
  .catch({});

export type ToolInput = z.output<typeof toolInput>;
type TextField = Exclude<keyof ToolInput, "code">;

/** The first non-empty field, as one line. */
function text(input: ToolInput, ...keys: TextField[]) {
  for (const key of keys) {
    const value = input[key]?.trim();
    if (value) return value.split("\n")[0];
  }
  return undefined;
}

const fileName = (path: string | undefined) => path?.split(/[\\/]/).at(-1);

function host(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Our own tools, under any harness prefix: mcp__startup-os__list_tasks, startup-os_list_tasks. */
function workspaceTitle(name: string) {
  const base = name
    .split("__")
    .at(-1)
    ?.replace(/^startup[-_]os_/, "");
  return base ? workspaceTitles.get(base) : undefined;
}

/** The workspace tools that code-mode code calls, such as tools["startup-os"].list_tasks(…). */
function calledTools(code: string) {
  const titles = new Set<string>();
  for (const match of code.matchAll(/(?:\.|\[["'])([a-z_]+)(?:["']\])?\s*\(/g)) {
    const title = match[1] && workspaceTitles.get(match[1]);
    if (title) titles.add(title);
  }
  return [...titles];
}

/** listTasks, list_tasks, list-tasks → "List tasks". */
function humanize(name: string) {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

const detail = (verb: string, value: string | undefined) => (value ? `${verb} · ${value}` : verb);

function describe(name: string, input: ToolInput) {
  const workspace = workspaceTitle(name);
  if (workspace) return workspace;
  switch (name.toLowerCase()) {
    case "execute": {
      const called = input.code ? calledTools(input.code) : [];
      return called.length ? called.join(", ") : "Run code";
    }
    case "skill":
      return detail("Use skill", text(input, "name", "skill", "command"));
    case "bash":
    case "shell":
      return detail("Run", text(input, "description", "command"));
    case "read":
      return detail("Read", fileName(text(input, "filePath", "file_path", "path")));
    case "write":
      return detail("Write", fileName(text(input, "filePath", "file_path", "path")));
    case "edit":
    case "multiedit":
      return detail("Edit", fileName(text(input, "filePath", "file_path", "path")));
    case "grep":
    case "glob":
      return detail("Search files", text(input, "pattern"));
    case "webfetch":
      return detail("Fetch", host(text(input, "url")));
    case "websearch":
      return detail("Search the web", text(input, "query"));
    case "task":
    case "agent":
      return detail("Start subagent", text(input, "description"));
    case "todowrite":
      return "Update to-dos";
  }
  return humanize(name.split("__").at(-1) ?? name);
}

/**
 * A short, readable label for one native tool call, such as "List tasks" or "Read · README.md".
 * Steps show it in the work status and the transcript. Parse native input with toolInput.
 */
export function toolLabel(name: string, input: ToolInput = {}): string {
  const label = describe(name, input);
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}
