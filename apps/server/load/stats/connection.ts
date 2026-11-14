import { SQL } from "bun";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const dataDirectory = fileURLToPath(new URL("../.data/", import.meta.url));

export function connectionUrl() {
  const url = new URL(
    process.env.LOAD_DATABASE_URL ??
      "postgres://substrate_load:substrate_load@localhost:5435/substrate_load",
  );
  const database = decodeURIComponent(url.pathname.slice(1));
  const allowed = process.env.LOAD_STATS_ALLOW_DB ?? "substrate_load";
  if (database !== allowed) {
    throw new Error(`Refusing database ${database}; expected ${allowed}.`);
  }
  return url.toString();
}

export function connect() {
  return new SQL(connectionUrl(), { max: 1 });
}

export function labelArgument() {
  const label = process.argv[2] ?? "latest";
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
    throw new Error("Label must contain only letters, digits, underscores, or hyphens.");
  }
  return label;
}

export async function writeJson<T>(name: string, value: T) {
  await mkdir(dataDirectory, { recursive: true });
  await Bun.write(`${dataDirectory}/${name}`, `${JSON.stringify(value, null, 2)}\n`);
}

export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
