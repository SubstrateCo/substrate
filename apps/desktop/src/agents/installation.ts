import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A stable ID for this installation, kept in its user data folder. It names the device that runs
 * an owner's agents. It is not a credential; the server authorizes every call by session.
 */
export function installationId(userDataDirectory: string) {
  const file = join(userDataDirectory, "installation-id");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (uuid.test(existing)) return existing.toLowerCase();
  } catch {
    /* A first launch has no file yet. */
  }
  const created = randomUUID();
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(file, created, { encoding: "utf8", mode: 0o600 });
  return created;
}
