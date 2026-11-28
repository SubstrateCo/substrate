import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function installationId(userDataDirectory: string) {
  const file = join(userDataDirectory, "installation-id");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (uuid.test(existing)) return existing.toLowerCase();
  } catch {}
  const created = randomUUID();
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(file, created, { encoding: "utf8", mode: 0o600 });
  return created;
}
