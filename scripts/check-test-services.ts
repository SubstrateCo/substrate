// Cached test results do not prove that the test services are up, so check them before Turbo runs.
import { RedisClient, SQL } from "bun";

async function postgres(url: string) {
  const sql = new SQL(url, { max: 1, connectionTimeout: 3 });
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.close();
  }
}

async function valkey(url: string) {
  const client = new RedisClient(url, {
    connectionTimeout: 3_000,
    autoReconnect: false,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    await client.send("PING", []);
  } finally {
    client.close();
  }
}

const services = [
  { name: "Postgres", variable: "TEST_DATABASE_URL", check: postgres },
  { name: "Valkey", variable: "TEST_VALKEY_URL", check: valkey },
];

const failures = await Promise.all(
  services.map(async ({ name, variable, check }) => {
    const url = process.env[variable];
    if (!url) return `${variable} is not set.`;
    try {
      await check(url);
      return undefined;
    } catch (error) {
      return `${name} is not reachable at ${variable}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }),
);

const messages = failures.filter((failure) => failure !== undefined);
if (messages.length > 0) {
  console.error(
    `Test services are not ready:\n${messages.map((message) => `  - ${message}`).join("\n")}\nStart them with: bun run services:test`,
  );
  process.exit(1);
}
