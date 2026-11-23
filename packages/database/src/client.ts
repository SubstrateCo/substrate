import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDatabase(options: { connectionString: string; maxConnections?: number }) {
  const client = postgres(options.connectionString, {
    max: options.maxConnections ?? 10,
    connection: { TimeZone: "UTC" },
  });
  return {
    db: drizzle(client),
    close: () => client.end(),
  };
}
