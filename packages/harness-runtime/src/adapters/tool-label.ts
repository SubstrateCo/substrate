import { z } from "zod";

const maxLength = 120;

/** The host's own MCP server: its name, as the harnesses see it, and its tools' titles. */
export interface HostTools {
  server: string;
  title(tool: string): string | undefined;
}

/** Shell executables whose script argument follows one of these flags. */
const shellFlags: ReadonlyMap<string, RegExp> = new Map([
  ["pwsh", /^-c(?:ommand)?$/i],
  ["powershell", /^-c(?:ommand)?$/i],
  ["cmd", /^\/[ck]$/i],
  ["bash", /^-l?c$/],
  ["sh", /^-l?c$/],
  ["zsh", /^-l?c$/],
]);

const executableName = (token: string) =>
  token
    .replace(/^["']|["']$/g, "")
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/\.exe$/i, "")
    .toLowerCase() ?? "";

function unquote(value: string) {
  const quote = value[0];
  if (value.length < 2 || (quote !== '"' && quote !== "'") || value.at(-1) !== quote) return value;
  const inner = value.slice(1, -1);
  return quote === "'" ? inner.replaceAll("'\\''", "'").replaceAll("''", "'") : inner;
}

/** The script inside a shell wrapper: pwsh -Command "bun test", bash -lc 'ls', cmd /c dir. */
function unwrapShell(command: string): string {
  const trimmed = command.trim();
  const first = /^(?:"[^"]*"|'[^']*'|\S+)/.exec(trimmed)?.[0];
  const flag = first && shellFlags.get(executableName(first));
  if (!first || !flag) return trimmed;
  const rest = trimmed.slice(first.length);
  for (const match of rest.matchAll(/\s(\S+)(?=\s)/g)) {
    if (!flag.test(match[1]!)) continue;
    const script = unquote(rest.slice(match.index + match[0].length).trim());
    return script ? unwrapShell(script) : trimmed;
  }
  return trimmed;
}

/** Codex sends argv arrays: ["pwsh.exe", "-Command", "bun test"]. */
function commandLine(argv: string[]) {
  const flag = argv[0] && shellFlags.get(executableName(argv[0]));
  const at = flag ? argv.findIndex((arg, index) => index > 0 && flag.test(arg)) : -1;
  return at > 0 && at < argv.length - 1 ? argv.slice(at + 1).join(" ") : argv.join(" ");
}

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
    command: z
      .union([z.string(), z.array(z.string()).transform(commandLine)])
      .optional()
      .catch(undefined),
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

/**
 * An MCP tool identifier as each harness writes it: mcp__server__tool (Claude),
 * mcp.server.tool (Codex), mcp/server/tool, or server.tool, server/tool and server_tool
 * (OpenCode) when the server is known.
 */
function mcpTool(name: string, servers: readonly string[], hostTools?: HostTools) {
  const prefix = /^mcp(__|[./:])/i.exec(name);
  if (prefix) {
    const rest = name.slice(prefix[0].length);
    const at = rest.indexOf(prefix[1]!);
    if (at > 0 && at < rest.length - prefix[1]!.length)
      return { server: rest.slice(0, at), tool: rest.slice(at + prefix[1]!.length) };
  }
  const lower = name.toLowerCase();
  for (const server of hostTools ? [hostTools.server, ...servers] : servers) {
    const names = new Set([server.toLowerCase(), server.toLowerCase().replace(/\W/g, "_")]);
    for (const known of names)
      for (const separator of ["__", ".", "/", "_"])
        if (lower.startsWith(known + separator) && name.length > known.length + separator.length)
          return { server, tool: name.slice(known.length + separator.length) };
  }
  return undefined;
}

/** The host's tools by their titles, other servers' tools as "github · Create issue". */
function mcpTitle(name: string, servers: readonly string[], hostTools?: HostTools) {
  const own = hostTools?.title(name);
  if (own) return own;
  const tool = mcpTool(name, servers, hostTools);
  if (!tool) return undefined;
  if (hostTools && tool.server.toLowerCase() === hostTools.server.toLowerCase())
    return hostTools.title(tool.tool) ?? humanize(tool.tool);
  return `${tool.server} · ${humanize(tool.tool)}`;
}

/** The command a call runs, without its shell wrapper. */
function command(input: ToolInput) {
  const description = text(input, "description");
  if (description) return description;
  const line = input.command && unwrapShell(input.command);
  return line ? line.split("\n")[0] : undefined;
}

/** The host tools that code-mode code calls, such as tools["substrate"].list_tasks(…). */
function calledTools(code: string, hostTools?: HostTools) {
  const titles = new Set<string>();
  for (const match of code.matchAll(/(?:\.|\[["'])([a-z_]+)(?:["']\])?\s*\(/g)) {
    const title = match[1] && hostTools?.title(match[1]);
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

function describe(
  name: string,
  input: ToolInput,
  servers: readonly string[],
  hostTools?: HostTools,
) {
  const mcp = mcpTitle(name, servers, hostTools);
  if (mcp) return mcp;
  switch (name.toLowerCase()) {
    case "execute": {
      const called = input.code ? calledTools(input.code, hostTools) : [];
      return called.length ? called.join(", ") : "Run code";
    }
    case "skill":
      return detail("Use skill", text(input, "name", "skill", "command"));
    case "bash":
    case "shell":
      return detail("Run", command(input));
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

const short = (label: string) =>
  label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;

/**
 * A short, readable label for one native tool call, such as "List tasks" or "Read · README.md".
 * Steps show it in the work status and the transcript. Parse native input with toolInput.
 * servers: the session's MCP server names, so bare server.tool names read as MCP tools.
 */
export function toolLabel(
  name: string,
  input: ToolInput = {},
  servers: readonly string[] = [],
  hostTools?: HostTools,
): string {
  return short(describe(name, input, servers, hostTools));
}

/** Titles that say nothing about the call; the kind and input describe it instead. */
const genericTitles = new Set(["", "tool", "tool call", "toolcall", "terminal"]);

/** ACP ToolKind; an unknown kind reads as missing. */
const toolKind = z
  .enum([
    "read",
    "edit",
    "delete",
    "move",
    "search",
    "execute",
    "think",
    "fetch",
    "switch_mode",
    "other",
  ])
  .optional()
  .catch(undefined);

/** A label from the ACP tool kind, for calls whose title says nothing. */
function kindLabel(kind: z.output<typeof toolKind>, input: ToolInput) {
  const path = fileName(text(input, "filePath", "file_path", "path"));
  switch (kind) {
    case "execute":
      return detail("Run", command(input));
    case "read":
      return detail("Read", path);
    case "edit":
      return detail("Edit", path);
    case "delete":
      return detail("Delete", path);
    case "move":
      return detail("Move", path);
    case "search":
      return detail("Search files", text(input, "pattern", "query"));
    case "fetch":
      return input.url
        ? detail("Fetch", host(text(input, "url")))
        : detail("Search the web", text(input, "query"));
    case "think":
      return "Think";
    case "switch_mode":
    case "other":
    case undefined:
      return "Tool";
  }
}

/** One ACP tool call as the agent announces it. */
export interface ToolCall {
  /** Programmatic tool name, when the agent reports one. */
  name?: string;
  title?: string;
  /** ACP ToolKind: execute, read, edit, delete, move, search, fetch, think, other. */
  kind?: string;
  input: ToolInput;
}

/**
 * The same label for a tool call whichever agent reports it: a tool name or identifier-like
 * title reads through toolLabel, a generic title through the kind and input, and a command
 * title loses its shell wrapper. Other titles are the agent's own words.
 */
export function toolCallLabel(
  call: ToolCall,
  servers: readonly string[] = [],
  hostTools?: HostTools,
): string {
  const { input } = call;
  const kind = toolKind.parse(call.kind);
  if (call.name) return toolLabel(call.name, input, servers, hostTools);
  const title = call.title?.trim() ?? "";
  if (genericTitles.has(title.toLowerCase())) return short(kindLabel(kind, input));
  if (kind === "execute") {
    if (input.command || input.description || /^(?:bash|shell)$/i.test(title))
      return short(kindLabel(kind, input));
    if (/^run\b/i.test(title)) return short(title);
    // Claude titles a command `ls -la`; Codex titles it with the command line itself.
    const script = unwrapShell(/^`([^`]+)`$/.exec(title)?.[1] ?? title).split("\n")[0];
    return short(detail("Run", script));
  }
  if (/^[\w.:/-]+$/.test(title)) return toolLabel(title, input, servers, hostTools);
  return short(title);
}
