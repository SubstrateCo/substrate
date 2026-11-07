import type { HarnessConfiguration, HarnessSessionRef } from "@startup-os/contracts/harness";

import { configurationState, nativeSessionRefs } from "./schema.ts";
import { and, eq, sql } from "drizzle-orm";
import type { RemoteCallback, SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { fileURLToPath } from "node:url";

export class MetadataStore {
  private constructor(
    private readonly database: SqliteRemoteDatabase,
    private readonly closeDatabase: () => void,
  ) {}

  static async open(
    path: string,
    migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url)),
  ): Promise<MetadataStore> {
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
          rows: (method === "get"
            ? statement.get(...params)
            : statement.all(...params)) as unknown[],
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
      return new MetadataStore(database, close);
    } catch (error) {
      close();
      throw error;
    }
  }

  async configure(configuration: HarnessConfiguration): Promise<void> {
    await this.database
      .insert(configurationState)
      .values({ organizationId: configuration.organizationId, configuration })
      .onConflictDoUpdate({ target: configurationState.organizationId, set: { configuration } });
  }

  async configuration(organizationId: string): Promise<HarnessConfiguration | undefined> {
    const row = await this.database
      .select({ configuration: configurationState.configuration })
      .from(configurationState)
      .where(eq(configurationState.organizationId, organizationId))
      .get();
    return row?.configuration;
  }

  async save(ref: HarnessSessionRef): Promise<void> {
    const { id, organizationId, agentId, harness, nativeSessionId } = ref;
    const values = { id, organizationId, agentId, harness, nativeSessionId };
    await this.database
      .insert(nativeSessionRefs)
      .values(values)
      .onConflictDoUpdate({ target: nativeSessionRefs.id, set: values });
  }

  async session(organizationId: string, id: string): Promise<HarnessSessionRef | undefined> {
    return this.database
      .select()
      .from(nativeSessionRefs)
      .where(
        and(eq(nativeSessionRefs.id, id), eq(nativeSessionRefs.organizationId, organizationId)),
      )
      .get();
  }

  close(): void {
    this.closeDatabase();
  }
}
