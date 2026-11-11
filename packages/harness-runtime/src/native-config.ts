import type { HarnessKind, HarnessMcpServer, HarnessSkill } from "@substrate/contracts/harness";

import { HarnessError } from "./errors.ts";
import { readOptional, safeId, safePath } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { parse as parseToml, stringify } from "smol-toml";
import { parseDocument } from "yaml";

/* oxlint-disable deslop/no-runtime-typeof, deslop/no-unsafe-dictionary-type, deslop/no-unknown-parameters -- This codec validates arbitrary native file formats and preserves unowned settings without exposing them as app configuration. */

function nativeObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HarnessError("invalid-config", label);
  // SAFETY: the value is a non-null object and not an array; all properties remain unknown until checked below.
  return value as Record<string, unknown>;
}

// Environment keys and native arguments use the same credential-name screen.
const credentialName = /token|secret|password|credential|api.?key|authorization/i;

function validateServer(server: HarnessMcpServer): void {
  safeId(server.id);
  if (server.id === "substrate")
    throw new HarnessError("reserved-id", "Substrate MCP is injected at execution time.");
  if (server.transport === "http") {
    const url = new URL(server.url);
    const isWebProtocol = ["http:", "https:"].includes(url.protocol);
    const hasCredentials = url.username || url.password;
    const hasQueryOrFragment = url.search || url.hash;
    if (!isWebProtocol || hasCredentials || hasQueryOrFragment)
      throw new HarnessError(
        "invalid-mcp-url",
        "Use an HTTP(S) URL without credentials, query strings, or fragments.",
      );
  } else if (!server.command || /[\0\r\n]/.test(server.command))
    throw new HarnessError("invalid-mcp-command", "A stdio server needs an executable command.");
  for (const [key, value] of Object.entries(server.environment ?? {})) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || credentialName.test(key) || /[\0\r\n]/.test(value))
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
  const root = await safePath(directory, harnessDefinitions[harness].skills);
  const skills: HarnessSkill[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    },
  )) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = await safePath(
      directory,
      `${harnessDefinitions[harness].skills}/${safeId(entry.name)}/SKILL.md`,
    );
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
    `${harnessDefinitions[harness].skills}/${safeId(skill.id)}/SKILL.md`,
    false,
    true,
  );
  const existing = await readOptional(path);
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
  await unlink(
    await safePath(directory, `${harnessDefinitions[harness].skills}/${safeId(id)}/SKILL.md`),
  );
}

/** Reads each candidate once, in precedence order. A missing configuration yields the default file. */
async function loadMcpDocuments(directory: string, harness: HarnessKind) {
  const candidates = harnessDefinitions[harness].mcpFiles;
  const documents: ReturnType<typeof mcpDocument>[] = [];
  for (const name of candidates) {
    const path = await safePath(directory, name);
    const text = await readOptional(path);
    if (text !== undefined) documents.push(mcpDocument(harness, name, path, text));
  }
  if (documents.length) return documents;
  const name = candidates[0];
  return [
    mcpDocument(
      harness,
      name,
      await safePath(directory, name),
      harnessDefinitions[harness].mcpFormat === "toml" ? "" : "{}\n",
    ),
  ];
}

function mcpDocument(harness: HarnessKind, name: string, path: string, text: string) {
  const errors: ParseError[] = [];
  let parsed: unknown;
  try {
    parsed =
      harnessDefinitions[harness].mcpFormat === "toml"
        ? parseToml(text)
        : parse(text, errors, { allowTrailingComma: true });
  } catch {
    throw new HarnessError("invalid-config", `Invalid native configuration: ${name}`);
  }
  if (errors.length)
    throw new HarnessError("invalid-config", `Invalid native configuration: ${name}`);
  const document = nativeObject(parsed, `Invalid native configuration: ${name}`);
  let servers: Record<string, unknown> = document;
  for (const key of harnessDefinitions[harness].mcpKeys) {
    servers = nativeObject(servers[key] ?? {}, `Invalid MCP configuration in ${name}`);
  }
  return { name, path, text, document, servers };
}

function describeServer(id: string, raw: unknown): HarnessMcpServer {
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
    args.some((arg) => typeof arg !== "string" || credentialName.test(arg));
  const readOnly = protectedEntry || (typeof url === "string" && /[?#@]/.test(url));
  if (url) {
    let address = "";
    if (typeof url === "string") {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      address = parsed.toString();
    }
    return { id, name: id, transport: "http", readOnly, url: address, args: [] };
  }
  let visibleCommand = "";
  if (typeof command === "string") visibleCommand = protectedCommand ? "native-managed" : command;
  return {
    id,
    name: id,
    transport: "stdio",
    readOnly,
    command: visibleCommand,
    args: protectedEntry ? [] : args.filter((arg): arg is string => typeof arg === "string"),
  };
}

export async function scanNativeServers(
  directory: string,
  harness: HarnessKind,
): Promise<HarnessMcpServer[]> {
  const servers: Record<string, unknown> = {};
  for (const document of await loadMcpDocuments(directory, harness))
    Object.assign(servers, document.servers);
  return Object.entries(servers).map(([id, raw]) => describeServer(id, raw));
}

export async function editNativeServer(
  directory: string,
  harness: HarnessKind,
  id: string,
  server?: HarnessMcpServer,
): Promise<void> {
  safeId(id);
  if (server) validateServer(server);
  const documents = await loadMcpDocuments(directory, harness);
  const defining = documents.filter((document) => id in document.servers);
  if (!server && defining.length > 1)
    throw new HarnessError(
      "configuration-conflict",
      "This MCP server is defined in several native files. Remove those definitions in the native harness to avoid exposing a lower-precedence server.",
    );
  // The last definition wins, matching the merged scan. A new entry goes in the last file.
  const { path, text, servers } = defining.at(-1) ?? documents[documents.length - 1];
  await safePath(directory, path, false, true);
  const previous =
    servers[id] === undefined
      ? undefined
      : nativeObject(servers[id], "MCP server entry must be an object.");
  // Editing credential-bearing entries would silently remove or re-store secrets. Native UI owns those.
  if (server && previous && describeServer(id, previous).readOnly)
    throw new HarnessError(
      "native-auth-required",
      "Edit credential-bearing MCP entries in the native harness.",
    );
  const replacement = { ...previous };
  // Remove transport-specific fields, but keep unrelated timeout and harness options.
  for (const key of ["type", "command", "args", "url", "httpUrl", "env", "environment"])
    delete replacement[key];
  const definition = harnessDefinitions[harness];
  if (server) Object.assign(replacement, definition.encodeMcpServer(server));
  if (definition.mcpFormat !== "toml") {
    await writeFile(
      path,
      applyEdits(
        text,
        modify(text, [...definition.mcpKeys, id], server ? replacement : undefined, {
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
          ? `${updated.endsWith("\n") || !updated ? "" : "\n"}${stringify({ mcp_servers: { [id]: replacement } })}`
          : ""),
      { mode: 0o600 },
    );
  }
}
