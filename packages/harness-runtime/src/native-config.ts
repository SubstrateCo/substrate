import type { HarnessKind, HarnessMcpServer, HarnessSkill } from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { safeId, safePath } from "./paths.ts";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parseDocument } from "yaml";

/* oxlint-disable deslop/no-runtime-typeof, deslop/no-unsafe-dictionary-type, deslop/no-unknown-parameters -- This codec validates arbitrary native file formats and preserves unowned settings without exposing them as app configuration. */

function nativeObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HarnessError("invalid-config", label);
  // SAFETY: the value is a non-null object and not an array; all properties remain unknown until checked below.
  return value as Record<string, unknown>;
}

const skillRoots: Record<HarnessKind, string> = {
  opencode: ".opencode/skills",
  claude: ".claude/skills",
  antigravity: ".agents/skills",
  codex: ".agents/skills",
};
const mcpFiles: Record<HarnessKind, string> = {
  opencode: "opencode.json",
  claude: ".mcp.json",
  antigravity: ".agents/mcp_config.json",
  codex: ".codex/config.toml",
};
const mcpKeys: Record<HarnessKind, string[]> = {
  opencode: ["mcp", "servers"],
  claude: ["mcpServers"],
  antigravity: ["mcpServers"],
  codex: ["mcp_servers"],
};

async function readOptional(path: string): Promise<string | undefined> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
}

function validateServer(server: HarnessMcpServer): void {
  safeId(server.id);
  if (server.id === "startup-os")
    throw new HarnessError("reserved-id", "Startup OS MCP is injected at execution time.");
  if (server.transport === "http") {
    const url = new URL(server.url ?? "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new HarnessError(
        "invalid-mcp-url",
        "Use an HTTP(S) URL without credentials, query strings, or fragments.",
      );
  } else if (!server.command || /[\0\r\n]/.test(server.command))
    throw new HarnessError("invalid-mcp-command", "A stdio server needs an executable command.");
  for (const [key, value] of Object.entries(server.environment ?? {})) {
    if (
      !/^[A-Z_][A-Z0-9_]*$/i.test(key) ||
      /token|secret|password|credential|api.?key|authorization/i.test(key) ||
      /[\0\r\n]/.test(value)
    )
      throw new HarnessError(
        "secret-configuration",
        "Only nonsecret MCP environment settings are supported. Authenticate in the native harness.",
      );
  }
  if (
    server.args?.some((value) =>
      /[\0\r\n]|(?:bearer\s|--(?:token|password|api-key|secret)(?:=|$))/i.test(value),
    )
  )
    throw new HarnessError("secret-configuration", "MCP arguments cannot contain credentials.");
}

export async function scanNativeSkills(
  directory: string,
  harness: HarnessKind,
): Promise<HarnessSkill[]> {
  const root = await safePath(directory, skillRoots[harness]);
  const skills: HarnessSkill[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    },
  )) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = await safePath(directory, `${skillRoots[harness]}/${safeId(entry.name)}/SKILL.md`);
    const text = await readOptional(path);
    if (!text) continue;
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    if (!match)
      throw new HarnessError("invalid-skill", `Skill lacks YAML frontmatter: ${entry.name}`);
    const frontmatter = parseDocument(match[1]);
    if (frontmatter.errors.length)
      throw new HarnessError("invalid-skill", `Invalid YAML frontmatter: ${entry.name}`);
    const field = (key: string) => {
      const value: unknown = frontmatter.get(key);
      return typeof value === "string" ? value : "";
    };
    skills.push({
      id: entry.name,
      name: field("name") || entry.name,
      description: field("description"),
      content: match[2].replace(/^\r?\n/, ""),
    });
  }
  return skills;
}

export async function saveNativeSkill(
  directory: string,
  harness: HarnessKind,
  skill: HarnessSkill,
  onlyIfAbsent = false,
): Promise<void> {
  safeId(skill.id);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id) ||
    skill.id.length > 64 ||
    skill.name !== skill.id
  )
    throw new HarnessError(
      "invalid-skill-name",
      "Skill name must match its lowercase, hyphen-separated directory ID (at most 64 characters).",
    );
  const path = await safePath(
    directory,
    `${skillRoots[harness]}/${safeId(skill.id)}/SKILL.md`,
    false,
    true,
  );
  const existing = await readOptional(path);
  if (onlyIfAbsent && existing !== undefined) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(existing);
    if (!match)
      throw new HarnessError(
        "configuration-conflict",
        "A native skill already uses the Startup OS default name.",
      );
    const metadata = parseDocument(match[1]);
    if (
      metadata.errors.length ||
      metadata.get("name") !== skill.name ||
      metadata.get("description") !== skill.description ||
      match[2].replace(/^\r?\n/, "") !== skill.content
    )
      throw new HarnessError(
        "configuration-conflict",
        "A native skill already uses the Startup OS default name.",
      );
    return;
  }
  // Preserve all unrelated frontmatter fields when editing a native skill.
  const match = existing && /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(existing);
  const frontmatter = parseDocument(match ? match[1] : "{}");
  if (frontmatter.errors.length)
    throw new HarnessError("invalid-skill", "Cannot edit invalid YAML frontmatter.");
  for (const [key, value] of [
    ["name", skill.name],
    ["description", skill.description],
  ]) {
    frontmatter.set(key, value);
  }
  const content = `---\n${frontmatter.toString()}---\n\n${skill.content}`;
  await writeFile(path, content, { mode: 0o600 });
}

export async function deleteNativeSkill(
  directory: string,
  harness: HarnessKind,
  id: string,
): Promise<void> {
  await unlink(await safePath(directory, `${skillRoots[harness]}/${safeId(id)}/SKILL.md`));
}

async function mcpNames(directory: string, harness: HarnessKind): Promise<string[]> {
  if (harness !== "opencode") return [mcpFiles[harness]];
  const names: string[] = [];
  for (const candidate of [
    "opencode.json",
    "opencode.jsonc",
    ".opencode/opencode.json",
    ".opencode/opencode.jsonc",
  ]) {
    if ((await readOptional(await safePath(directory, candidate))) !== undefined)
      names.push(candidate);
  }
  return names.length ? names : [mcpFiles[harness]];
}

async function mcpDocument(directory: string, harness: HarnessKind, name = mcpFiles[harness]) {
  const path = await safePath(directory, name);
  const text = (await readOptional(path)) ?? (harness === "codex" ? "" : "{}\n");
  const errors: ParseError[] = [];
  let parsed: unknown;
  try {
    parsed =
      harness === "codex" ? parseToml(text) : parse(text, errors, { allowTrailingComma: true });
  } catch {
    throw new HarnessError("invalid-config", `Invalid native configuration: ${name}`);
  }
  if (errors.length)
    throw new HarnessError("invalid-config", `Invalid native configuration: ${name}`);
  const document = nativeObject(parsed, `Invalid native configuration: ${name}`);
  let servers: Record<string, unknown> = document;
  for (const key of mcpKeys[harness]) {
    servers = nativeObject(servers[key] ?? {}, `Invalid MCP configuration in ${name}`);
  }
  return { path, text, document, servers };
}

function encodeServer(harness: HarnessKind, server: HarnessMcpServer) {
  if (harness === "opencode")
    return server.transport === "http"
      ? { type: "remote", url: server.url }
      : {
          type: "local",
          command: [server.command, ...(server.args ?? [])],
          environment: server.environment,
        };
  if (harness === "codex")
    return server.transport === "http"
      ? { url: server.url }
      : { command: server.command, args: server.args ?? [], env: server.environment ?? {} };
  if (server.transport === "stdio")
    return { command: server.command, args: server.args ?? [], env: server.environment ?? {} };
  if (harness === "claude") return { type: "http", url: server.url };
  return { httpUrl: server.url };
}

export async function scanNativeServers(
  directory: string,
  harness: HarnessKind,
): Promise<HarnessMcpServer[]> {
  const servers: Record<string, unknown> = {};
  for (const name of await mcpNames(directory, harness))
    Object.assign(servers, (await mcpDocument(directory, harness, name)).servers);
  return Object.entries(servers).map(([id, raw]) => {
    const value = nativeObject(raw, "MCP server entry must be an object.");
    const url = value.url ?? value.httpUrl;
    const command = Array.isArray(value.command) ? value.command[0] : value.command;
    // Never expose native credentials or environment values to the renderer.
    let args: unknown[] = [];
    if (Array.isArray(value.command)) args = value.command.slice(1);
    else if (Array.isArray(value.args)) args = value.args;
    const protectedCommand =
      typeof command === "string" &&
      /token|secret|password|credential|api.?key|authorization|bearer\s/i.test(command);
    const protectedEntry =
      protectedCommand ||
      Object.entries(value).some(
        ([key, entry]) =>
          /token|secret|password|authorization|headers|env|environment|oauth/i.test(key) &&
          entry !== undefined &&
          (typeof entry !== "object" || (entry !== null && Object.keys(entry).length > 0)),
      ) ||
      args.some(
        (arg) =>
          typeof arg !== "string" ||
          /token|secret|password|credential|api.?key|authorization/i.test(arg),
      );
    const result: HarnessMcpServer = {
      id,
      name: id,
      transport: url ? "http" : "stdio",
      readOnly: protectedEntry || (typeof url === "string" && /[?#@]/.test(url)),
      args: [],
    };
    if (typeof url === "string") {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      result.url = parsed.toString();
    }
    if (typeof command === "string") result.command = protectedCommand ? "native-managed" : command;
    if (!protectedEntry) result.args = args.filter((arg): arg is string => typeof arg === "string");
    return result;
  });
}

export async function editNativeServer(
  directory: string,
  harness: HarnessKind,
  id: string,
  server?: HarnessMcpServer,
): Promise<void> {
  safeId(id);
  if (server) validateServer(server);
  const names = await mcpNames(directory, harness);
  let definitions = 0;
  let name = names[names.length - 1];
  for (const candidate of names)
    if (id in (await mcpDocument(directory, harness, candidate)).servers) {
      name = candidate;
      definitions++;
    }
  if (!server && definitions > 1)
    throw new HarnessError(
      "configuration-conflict",
      "This MCP server is defined in several native files. Remove those definitions in the native harness to avoid exposing a lower-precedence server.",
    );
  const { path, text, servers } = await mcpDocument(directory, harness, name);
  await safePath(directory, path, false, true);
  const previous =
    servers[id] === undefined
      ? undefined
      : nativeObject(servers[id], "MCP server entry must be an object.");
  // Editing credential-bearing entries would silently remove or re-store secrets. Native UI owns those.
  if (
    server &&
    previous &&
    (await scanNativeServers(directory, harness)).find((entry) => entry.id === id)?.readOnly
  )
    throw new HarnessError(
      "native-auth-required",
      "Edit credential-bearing MCP entries in the native harness.",
    );
  const replacement = { ...previous };
  // Remove transport-specific fields, but keep unrelated timeout and harness options.
  for (const key of ["type", "command", "args", "url", "httpUrl", "env", "environment"])
    delete replacement[key];
  if (server) Object.assign(replacement, encodeServer(harness, server));
  if (harness !== "codex") {
    await writeFile(
      path,
      applyEdits(
        text,
        modify(text, [...mcpKeys[harness], id], server ? replacement : undefined, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        }),
      ),
      { mode: 0o600 },
    );
  } else {
    const lines = text.split(/(?<=\n)/);
    const result: string[] = [];
    let removing = false;
    let found = false;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const target = new RegExp(
      `^\\s*\\[mcp_servers\\.(?:${escaped}|"${escaped}"|'${escaped}')(?:\\.|\\])`,
    );
    for (const line of lines) {
      if (/^\s*\[/.test(line)) {
        removing = target.test(line);
        if (removing) found = true;
      }
      if (!removing) result.push(line);
    }
    if (previous && !found)
      throw new HarnessError(
        "unsupported-config-format",
        "This Codex MCP entry uses inline TOML. Edit it in the native harness; the host will not rewrite unrelated TOML.",
      );
    const updated = result.join("");
    await writeFile(
      path,
      updated +
        (server
          ? `${updated.endsWith("\n") || !updated ? "" : "\n"}${stringifyToml({ mcp_servers: { [id]: replacement } })}`
          : ""),
      { mode: 0o600 },
    );
  }
}
