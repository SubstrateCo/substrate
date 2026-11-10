import { sql } from "drizzle-orm";
import type { RemoteCallback, SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { fileURLToPath } from "node:url";

/** A transaction on the local database. Every store operation runs in one. */
export type LocalTransaction = Parameters<Parameters<SqliteRemoteDatabase["transaction"]>[0]>[0];

const defaultMigrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * Opens a local SQLite file and applies the migrations. Bun uses bun:sqlite; Electron's Node
 * uses node:sqlite.
 */
export async function openLocalDatabase(
  path: string,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<{ database: SqliteRemoteDatabase; close: () => void }> {
  let execute: RemoteCallback;
  let close: () => void;
  if (typeof Bun !== "undefined") {
    const database = new (await import("bun:sqlite")).Database(path);
    close = () => database.close();
    execute = async (query, params, method) => {
      // Cached queries are finalized on close, releasing Windows file locks.
      const statement = database.query(query);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      const rows = statement.values(...params);
      // The proxy get contract expects one row (or undefined), not a nested array.
      return { rows: method === "get" ? rows[0]! : rows };
    };
  } else {
    const database = new (await import("node:sqlite")).DatabaseSync(path);
    close = () => database.close();
    execute = async (query, params, method) => {
      const statement = database.prepare(query);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      // SAFETY: Node's types still describe object rows after setReturnArrays(true).
      return {
        rows: (method === "get" ? statement.get(...params) : statement.all(...params)) as unknown[],
      };
    };
  }
  const database = drizzle(execute);
  try {
    await database.run(sql`PRAGMA journal_mode = WAL`);
    await migrate(
      database,
      async (queries) => {
        await database.transaction(async (tx) => {
          for (const query of queries) await tx.run(sql.raw(query));
        });
      },
      { migrationsFolder: migrationsDirectory },
    );
    return { database, close };
  } catch (error) {
    close();
    throw error;
  }
}

/**
 * Runs operations one at a time. The proxy driver shares one connection, so an operation that
 * awaited inside a transaction would otherwise let another operation's queries join it.
 */
export function serialTransactions(database: SqliteRemoteDatabase) {
  let queue: Promise<unknown> = Promise.resolve();
  return function run<T>(operation: (tx: LocalTransaction) => Promise<T>): Promise<T> {
    const result = queue.then(() => database.transaction(operation));
    queue = result.catch(() => undefined);
    return result;
  };
}
export type RunTransaction = ReturnType<typeof serialTransactions>;
