import { sql } from "drizzle-orm";
import type { RemoteCallback, SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** A transaction on the local database. Every store operation runs in one. */
export type LocalTransaction = Parameters<Parameters<SqliteRemoteDatabase["transaction"]>[0]>[0];

const defaultMigrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

/** SQLite's built-in lower() only folds ASCII. Use the same normalization as the JS query. */
export function foldSearchText(text: string) {
  return text.normalize("NFC").toLowerCase().normalize("NFC");
}

function nodeConnection(path: string, readOnly: boolean) {
  const db = new DatabaseSync(path, { readOnly });
  db.function("fold_search", { deterministic: true }, (value) => foldSearchText(String(value)));
  const statements = new Map<string, StatementSync>();
  const execute: RemoteCallback = async (query, params, method) => {
    let statement = statements.get(query);
    if (!statement) {
      statement = db.prepare(query);
      statement.setReturnArrays(true);
      statements.set(query, statement);
    }
    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }
    // SAFETY: Node types rows as objects even after setReturnArrays(true).
    return {
      rows: (method === "get" ? statement.get(...params) : statement.all(...params)) as unknown[],
    };
  };
  return {
    database: drizzle(execute),
    close: () => {
      statements.clear();
      db.close();
    },
  };
}

/** The writer has already migrated this file. Never migrate or write from a search worker. */
export const openLocalReader = (path: string) => nodeConnection(path, true);

/**
 * Opens a local SQLite file and applies the migrations. Bun uses bun:sqlite; Electron's Node
 * uses node:sqlite.
 */
export async function openLocalDatabase(
  path: string,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<{ database: SqliteRemoteDatabase; close: () => void }> {
  let connection: ReturnType<typeof nodeConnection>;
  if (typeof Bun !== "undefined") {
    const database = new (await import("bun:sqlite")).Database(path);
    database.function("fold_search", { deterministic: true }, (value) =>
      foldSearchText(String(value)),
    );
    const execute: RemoteCallback = async (query, params, method) => {
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
    connection = { database: drizzle(execute), close: () => database.close() };
  } else connection = nodeConnection(path, false);
  const { database, close } = connection;
  try {
    await database.run(sql`PRAGMA journal_mode = WAL`);
    // With WAL, NORMAL stays consistent after a crash; a power failure can lose the last commits.
    await database.run(sql`PRAGMA synchronous = NORMAL`);
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
