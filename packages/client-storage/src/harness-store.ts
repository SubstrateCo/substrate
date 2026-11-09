import type { HarnessConfiguration } from "@startup-os/contracts/harness";

import { openLocalDatabase } from "./database.ts";
import { configurationState } from "./schema/index.ts";
import { eq } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

export class HarnessStore {
  private constructor(
    private readonly database: SqliteRemoteDatabase,
    private readonly closeDatabase: () => void,
  ) {}

  static async open(path: string, migrationsDirectory?: string): Promise<HarnessStore> {
    const { database, close } = await openLocalDatabase(path, migrationsDirectory);
    return new HarnessStore(database, close);
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

  close(): void {
    this.closeDatabase();
  }
}
