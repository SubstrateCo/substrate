import { createDatabase } from "../client";
import { migrateDatabase } from "../migrations";
import { testDatabaseURL } from "./environment.ts";
import { sql } from "drizzle-orm";
import postgres from "postgres";

export async function createTestDatabases(count: number) {
  const base = testDatabaseURL();
  const admin = postgres(base.href, { max: 1 });
  const names: string[] = [];
  const workers: string[] = [];
  const close = async () => {
    try {
      await Promise.all(names.map((name) => admin`DROP DATABASE ${admin(name)} WITH (FORCE)`));
    } finally {
      await admin.end();
    }
  };
  const connection = (name: string) => {
    const url = new URL(base);
    url.pathname = `/${name}`;
    return url.href;
  };
  try {
    const prefix = `substrate_${crypto.randomUUID().replaceAll("-", "")}`;
    // Migrating one template and copying it is faster than migrating every worker database.
    const template = `${prefix}_template_test`;
    await admin`CREATE DATABASE ${admin(template)}`;
    names.push(template);
    const migration = createDatabase({ connectionString: connection(template), maxConnections: 1 });
    try {
      await migration.db.execute(sql`SET client_min_messages TO WARNING`);
      await migrateDatabase(migration.db);
    } finally {
      // A template cannot be copied while a session is connected to it.
      await migration.close();
    }
    for (let shard = 0; shard < count; shard++) {
      const name = `${prefix}_${shard}_test`;
      await admin`CREATE DATABASE ${admin(name)} TEMPLATE ${admin(template)}`;
      names.push(name);
      workers.push(name);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { connections: workers.map(connection), close };
}
