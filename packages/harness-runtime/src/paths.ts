import { HarnessError } from "./errors.ts";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export async function readOptional(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
}

export function safeId(value: string): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value)
  ) {
    throw new HarnessError("invalid-id", "IDs must be safe, non-reserved path segments.");
  }
  return value;
}

export async function safePath(
  root: string,
  path: string,
  directory = false,
  createParents = false,
): Promise<string> {
  const canonicalRoot = await realpath(root);
  const target = resolve(canonicalRoot, path);
  const rel = relative(canonicalRoot, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new HarnessError("unsafe-path", "Path is outside its account boundary.");
  }
  let current = canonicalRoot;
  const parts = rel.split(sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (stat?.isSymbolicLink())
      throw new HarnessError("unsafe-path", "Managed paths cannot contain symlinks or junctions.");
    if (!stat && (directory || (createParents && index < parts.length - 1))) await mkdir(current);
  }
  return target;
}

export async function organizationDirectory(
  accountDirectory: string,
  organizationId: string,
): Promise<string> {
  await mkdir(accountDirectory, { recursive: true });
  return safePath(accountDirectory, join("orgs", safeId(organizationId)), true);
}

export async function agentDirectory(
  accountDirectory: string,
  organizationId: string,
  agentId: string,
): Promise<string> {
  return safePath(
    await organizationDirectory(accountDirectory, organizationId),
    safeId(agentId),
    true,
  );
}

/**
 * A helper's own folder: `orgs/<org>/_helpers/<agentId>/<helperId>`. The leading underscore
 * cannot match an agent ID, so helper folders never collide with agent folders.
 */
export async function helperDirectory(
  accountDirectory: string,
  organizationId: string,
  agentId: string,
  helperId: string,
): Promise<string> {
  return safePath(
    await organizationDirectory(accountDirectory, organizationId),
    join("_helpers", safeId(agentId), safeId(helperId)),
    true,
  );
}
