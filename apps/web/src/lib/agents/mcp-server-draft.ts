import {
  harnessMcpServerSchema,
  maxHarnessMcpServers,
  type HarnessMcpServer,
} from "@substrate/contracts/harness-runtime";

import type { z } from "zod";

export type McpServerArgRow = { id: string; value: string };
export type McpServerEnvironmentRow = { id: string; key: string; value: string };

export type McpServerDraft = {
  name: string;
  transport: HarnessMcpServer["transport"];
  command: string;
  args: McpServerArgRow[];
  environment: McpServerEnvironmentRow[];
  url: string;
};

export const newArgRow = (value = ""): McpServerArgRow => ({ id: crypto.randomUUID(), value });

export const newEnvironmentRow = (key = "", value = ""): McpServerEnvironmentRow => ({
  id: crypto.randomUUID(),
  key,
  value,
});

export type McpServerDraftErrors = {
  name?: string;
  command?: string;
  url?: string;
  args: Record<number, string>;
  environment: Record<number, string>;
};

export const credentialsMessage =
  "Credentials aren’t allowed here. Keep tokens and keys in the server’s own sign-in or configuration.";

export function draftFromServer(server?: HarnessMcpServer): McpServerDraft {
  return {
    name: server?.name ?? "",
    transport: server?.transport ?? "stdio",
    command: server?.transport === "stdio" ? server.command : "",
    args: server?.transport === "stdio" ? (server.args ?? []).map((arg) => newArgRow(arg)) : [],
    environment:
      server?.transport === "stdio"
        ? Object.entries(server.environment ?? {}).map(([key, value]) =>
            newEnvironmentRow(key, value),
          )
        : [],
    url: server?.transport === "http" ? server.url : "",
  };
}

export function mcpServerId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|-+$/g, "")
    .slice(0, 128);
}

export const mcpServerLimitReached = (servers: readonly HarnessMcpServer[]) =>
  servers.length >= maxHarnessMcpServers;

const emptyErrors = (): McpServerDraftErrors => ({ args: {}, environment: {} });

function issueMessage(issue: z.core.$ZodIssue, draft: McpServerDraft): string {
  const [field] = issue.path;
  const tooLong = issue.code === "too_big";
  switch (field) {
    case "id":
      return issue.code === "custom"
        ? "“substrate” is the built-in server. Choose another name."
        : "Use at least one letter or number in the name.";
    case "name":
      return tooLong ? "Use a name of 200 characters or fewer." : "Enter a server name.";
    case "command":
      if (issue.code === "custom") return credentialsMessage;
      return tooLong
        ? "Use a command of 2,000 characters or fewer."
        : "Enter the command that starts the server.";
    case "args":
      if (issue.code === "custom") return credentialsMessage;
      return tooLong ? "Use 10,000 characters or fewer." : "Check this argument.";
    case "environment": {
      if (issue.code === "custom" || issue.code === "invalid_key") {
        const key = String(issue.path[1] ?? "");
        // A rejected key name reports invalid_key; a key that names a credential is custom too.
        if (issue.code === "invalid_key" && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
          return "Use letters, numbers, and underscores, starting with a letter or underscore.";
        return credentialsMessage;
      }
      return tooLong ? "Use 10,000 characters or fewer." : "Check this variable.";
    }
    case "url":
      if (issue.code === "custom")
        return "Use an http or https URL without a user name, password, query, or fragment.";
      if (tooLong) return "Use a shorter URL.";
      if (!draft.url.trim()) return "Enter the server’s URL.";
      return "Enter a complete URL, like https://mcp.example.com/mcp.";
    default:
      return "Check this server’s settings.";
  }
}

function environmentRow(draft: McpServerDraft, key: PropertyKey | undefined) {
  return draft.environment.findIndex((row) => row.key.trim() === key);
}

function stdioServer(
  id: string,
  draft: McpServerDraft,
  args: string[],
  environment: Record<string, string>,
) {
  const server: Extract<HarnessMcpServer, { transport: "stdio" }> = {
    id,
    name: draft.name,
    transport: "stdio",
    command: draft.command.trim(),
  };
  if (args.length) server.args = args;
  if (Object.keys(environment).length) server.environment = environment;
  return server;
}

export function serverFromDraft(
  draft: McpServerDraft,
  options: { id?: string; servers: readonly HarnessMcpServer[] },
):
  | { server: HarnessMcpServer; errors?: undefined }
  | { server?: undefined; errors: McpServerDraftErrors } {
  const errors = emptyErrors();
  const id = options.id ?? mcpServerId(draft.name);
  if (!options.id && id && options.servers.some((server) => server.id === id))
    errors.name = "Another server already has this name.";
  const argRows = draft.args.flatMap((arg, index) => (arg.value.trim() ? [index] : []));
  const args = argRows.map((index) => draft.args[index]!.value.trim());
  const environment: Record<string, string> = {};
  draft.environment.forEach((row, index) => {
    const key = row.key.trim();
    if (!key && !row.value) return;
    if (!key) errors.environment[index] = "Enter a variable name.";
    else if (Object.hasOwn(environment, key))
      errors.environment[index] = "Each variable needs its own name.";
    else environment[key] = row.value;
  });
  const candidate =
    draft.transport === "stdio"
      ? stdioServer(id, draft, args, environment)
      : { id, name: draft.name, transport: "http" as const, url: draft.url.trim() };
  const parsed = harnessMcpServerSchema.safeParse(candidate);
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const message = issueMessage(issue, draft);
      const [field, at] = issue.path;
      if (field === "args") errors.args[argRows[Number(at)] ?? 0] ??= message;
      else if (field === "environment") {
        errors.environment[Math.max(environmentRow(draft, at), 0)] ??= message;
      } else if (field === "id" || field === "name") errors.name ??= message;
      else if (field === "command" || field === "url") errors[field] ??= message;
      else errors.name ??= message;
    }
  const failed =
    errors.name ||
    errors.command ||
    errors.url ||
    Object.keys(errors.args).length ||
    Object.keys(errors.environment).length;
  if (failed || !parsed.success) return { errors };
  return { server: parsed.data };
}
