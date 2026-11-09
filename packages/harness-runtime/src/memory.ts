import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";

import { HarnessError } from "./errors.ts";
import { readOptional, safePath } from "./paths.ts";
import { readdir, writeFile } from "node:fs/promises";

/** Profile memory is included in every managed prefix, so it stays small. */
export const profileMemoryLimit = 4000;

const profileFile = "memory/profile.md";
const notesFile = "memory/notes.md";
const logDirectory = "memory/log";
const logFile = /^\d{4}-\d{2}\.md$/;
const expiring = /^- \[expires ([^\]]+)\] /;

/** Memory errors reach the agent with this code, so it can correct its input. */
export class MemoryError extends HarnessError {
  constructor(message: string) {
    super("INVALID_INPUT", message);
  }
}

const locks = new Map<string, Promise<unknown>>();
/** Serializes memory edits per agent folder so concurrent tool calls do not lose entries. */
function locked<T>(folder: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(folder) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  locks.set(folder, settled);
  void settled.then(() => {
    if (locks.get(folder) === settled) locks.delete(folder);
  });
  return next;
}

/** One entry per line keeps forget simple and the files readable. */
function entry(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function lines(content: string | undefined) {
  return (content ?? "").split("\n").filter((line) => line.trim());
}

function unexpired(content: string | undefined, now: Date) {
  return lines(content).filter((line) => {
    const expiresAt = expiring.exec(line)?.[1];
    return !expiresAt || Date.parse(expiresAt) > now.getTime();
  });
}

async function write(folder: string, path: string, entries: string[]) {
  const target = await safePath(folder, path, false, true);
  await writeFile(target, entries.length ? `${entries.join("\n")}\n` : "", { mode: 0o600 });
}

async function read(folder: string, path: string) {
  return readOptional(await safePath(folder, path));
}

/** The profile memory for the managed prefix, or empty. */
export async function readProfileMemory(agentFolder: string): Promise<string> {
  return ((await read(agentFolder, profileFile)) ?? "").slice(0, profileMemoryLimit);
}

export function remember(
  agentFolder: string,
  input: McpInput<"remember">,
  now = new Date(),
): Promise<McpOutput<"remember">> {
  return locked(agentFolder, async () => {
    const text = entry(input.text);
    if (input.expiresAt !== undefined && input.layer !== "notes")
      throw new MemoryError("expiresAt applies only to the notes layer.");
    if (input.layer === "profile") {
      const entries = lines(await read(agentFolder, profileFile));
      const line = `- ${text}`;
      if (!entries.includes(line)) {
        const next = [...entries, line];
        if (`${next.join("\n")}\n`.length > profileMemoryLimit)
          throw new MemoryError(
            `Profile memory is full (max ${profileMemoryLimit} characters). Use forget to remove stale entries, then try again.`,
          );
        await write(agentFolder, profileFile, next);
      }
    } else if (input.layer === "notes") {
      if (input.expiresAt !== undefined && Date.parse(input.expiresAt) <= now.getTime())
        throw new MemoryError("expiresAt must be in the future.");
      const entries = unexpired(await read(agentFolder, notesFile), now);
      const line = input.expiresAt
        ? `- [expires ${new Date(input.expiresAt).toISOString()}] ${text}`
        : `- ${text}`;
      await write(agentFolder, notesFile, [...entries, line]);
    } else {
      const path = `${logDirectory}/${now.toISOString().slice(0, 7)}.md`;
      const entries = lines(await read(agentFolder, path));
      await write(agentFolder, path, [...entries, `- ${now.toISOString()} ${text}`]);
    }
    return { layer: input.layer, saved: true as const };
  });
}

export function forget(
  agentFolder: string,
  input: McpInput<"forget">,
  now = new Date(),
): Promise<McpOutput<"forget">> {
  return locked(agentFolder, async () => {
    const match = input.match.toLowerCase();
    let removed = 0;
    const prune = async (path: string, entries: string[]) => {
      const kept = entries.filter((line) => !line.toLowerCase().includes(match));
      removed += entries.length - kept.length;
      if (kept.length !== entries.length) await write(agentFolder, path, kept);
    };
    if (input.layer === "profile")
      await prune(profileFile, lines(await read(agentFolder, profileFile)));
    else if (input.layer === "notes")
      await prune(notesFile, unexpired(await read(agentFolder, notesFile), now));
    else {
      const directory = await safePath(agentFolder, logDirectory);
      const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return [];
      });
      for (const file of files.filter((name) => logFile.test(name)).sort())
        await prune(
          `${logDirectory}/${file}`,
          lines(await read(agentFolder, `${logDirectory}/${file}`)),
        );
    }
    return { layer: input.layer, removed };
  });
}
