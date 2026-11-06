import { hashPassword } from "better-auth/crypto";
import { createDatabase, migrateDatabase } from "@startup-os/database";
import { developmentTeams, seedDevelopmentDatabase } from "@startup-os/database/development";

if (process.env.NODE_ENV === "production")
  throw new Error("Development seeding is disabled in production.");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Development seeding requires a local DATABASE_URL.");
}
const password = process.env.DEV_SEED_PASSWORD ?? "StartupOS-dev-2026!";
if (password.length < 12) throw new Error("DEV_SEED_PASSWORD must have at least 12 characters.");
const { db, close } = createDatabase({ connectionString, maxConnections: 1 });
try {
  await migrateDatabase(db);
  const created = await seedDevelopmentDatabase(db, await hashPassword(password));
  console.log(
    created
      ? "Development workspace created."
      : "Development workspace already exists; data and passwords unchanged.",
  );
  for (const team of developmentTeams) {
    console.log(`${team.name}: ${team.people.map((person) => person.email).join(", ")}`);
  }
  if (created) console.log(`Password for all seeded users: ${password}`);
} finally {
  await close();
}
