import { harnessIdSchema } from "@substrate/contracts/harness-runtime";

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
    !harnessIdSchema.safeParse(value).success ||
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

function within(root: string, path: string) {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/**
 * A folder the user chose for an agent's sessions to work in, as its canonical path. It must be
 * an existing directory apart from the account's managed folders: neither inside them nor
 * containing them, so a session never reaches other agents' files.
 */
export async function workspaceDirectory(accountDirectory: string, path: string): Promise<string> {
  if (!isAbsolute(path))
    throw new HarnessError("invalid-workspace", "The working folder must be an absolute path.");
  const canonical = await realpath(path).catch(() => undefined);
  const stat = canonical === undefined ? undefined : await lstat(canonical);
  if (canonical === undefined || !stat?.isDirectory())
    throw new HarnessError("invalid-workspace", "The working folder does not exist.");
  await mkdir(accountDirectory, { recursive: true });
  const account = await realpath(accountDirectory);
  if (within(account, canonical) || within(canonical, account))
    throw new HarnessError("invalid-workspace", "The working folder overlaps Substrate's folders.");
  return canonical;
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
