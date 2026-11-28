import { createDatabase } from "../client";
import { RepositoryEffects, effectExecutor } from "../core/effects";
import type { DatabaseExecutor } from "../core/executor";
import * as schema from "../schema";
import { testDatabaseURL } from "./environment";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

class DiscardedEffects extends RepositoryEffects {
  override hint() {}
  override mail() {}
}

export function discardEffects<T extends DatabaseExecutor>(db: T) {
  // SAFETY: the effect executor forwards every property of the database it wraps.
  return effectExecutor(db, new DiscardedEffects()) as T;
}

const connection = createDatabase({ connectionString: testDatabaseURL().href, maxConnections: 4 });
export const testDatabase = discardEffects(connection.db);
export const closeTestDatabase = () => connection.db.$client.end({ timeout: 5 });

// Deleting children before their parents satisfies every foreign key. On small tables this is much
// faster than TRUNCATE, which replaces the files of every table and index.
function childrenFirst(tables: PgTable[]) {
  const parents = new Map(
    tables.map((table) => [
      table,
      new Set(
        getTableConfig(table)
          .foreignKeys.map((key) => key.reference().foreignTable)
          .filter((parent) => parent !== table),
      ),
    ]),
  );
  const ordered: PgTable[] = [];
  const left = new Set(tables);
  while (left.size) {
    const ready = [...left].filter(
      (table) => ![...left].some((child) => parents.get(child)!.has(table)),
    );
    if (!ready.length) throw new Error("Test reset cannot order tables with a foreign key cycle.");
    for (const table of ready) {
      ordered.push(table);
      left.delete(table);
    }
  }
  return ordered;
}

const tables = Object.values(schema).filter((value) => is(value, PgTable));
const resetStatements = childrenFirst(tables)
  .map((table) => {
    const { name, schema: tableSchema } = getTableConfig(table);
    return `DELETE FROM ${tableSchema ? `"${tableSchema}".` : ""}"${name}";`;
  })
  .join("\n");

/** Removes all rows. The statements run as one simple query, which is one implicit transaction. */
export const resetTestData = () => testDatabase.$client.unsafe(resetStatements).simple();
