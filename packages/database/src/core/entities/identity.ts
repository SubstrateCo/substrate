import { entityType } from "./schema";
import { sql } from "drizzle-orm";
import { text, uuid } from "drizzle-orm/pg-core";

export function entityIdentity(type: (typeof entityType.enumValues)[number]) {
  return {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityType: entityType("entity_type")
      .generatedAlwaysAs(sql.raw(`'${type}'::entity_type`))
      .notNull(),
  };
}
