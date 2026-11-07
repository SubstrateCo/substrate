import { user } from "../authentication/schema";
import { storedFiles } from "../storage/schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// User-owned definitions retain organization-scoped actors for attribution.
export const userAgents = pgTable(
  "user_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    harness: text("harness", { enum: ["opencode", "antigravity", "claude", "codex"] }).notNull(),
    model: text("model"),
    imageFileId: uuid("image_file_id"),
    picturePurpose: text("picture_purpose").notNull().default("avatar"),
    enabled: boolean("enabled").notNull().default(true),
    useStartupDefaults: boolean("use_startup_defaults").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("user_agents_owner_id_unique").on(table.userId, table.id),
    check("user_agent_picture_purpose", sql`${table.picturePurpose} = 'avatar'`),
    foreignKey({
      name: "user_agent_picture_file_owner_fk",
      columns: [table.imageFileId, table.userId, table.picturePurpose],
      foreignColumns: [storedFiles.id, storedFiles.ownerUserId, storedFiles.purpose],
    }),
  ],
);
