import { user } from "../authentication/schema";
import { organization } from "../organizations/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const ownership = () => ({
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
});

export const fileUploads = pgTable(
  "file_uploads",
  {
    id: uuid("id").primaryKey(),
    ...ownership(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    temporaryKey: text("temporary_key").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    temporaryCleanedAt: timestamp("temporary_cleaned_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "file_upload_owner",
      sql`(${t.purpose} = 'avatar' AND ${t.ownerUserId} IS NOT NULL AND ${t.organizationId} IS NULL AND ${t.uploadedBy} = ${t.ownerUserId}) OR (${t.purpose} IN ('organization-logo', 'file') AND ${t.organizationId} IS NOT NULL AND ${t.ownerUserId} IS NULL)`,
    ),
    check("file_upload_size", sql`${t.size} > 0 AND ${t.size} <= 5242880`),
    index("file_upload_expiry_idx").on(t.expiresAt),
  ],
);

export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey(),
    ...ownership(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    objectKey: text("object_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "stored_file_owner",
      sql`(${t.purpose} = 'avatar' AND ${t.ownerUserId} IS NOT NULL AND ${t.organizationId} IS NULL AND ${t.uploadedBy} = ${t.ownerUserId}) OR (${t.purpose} IN ('organization-logo', 'file') AND ${t.organizationId} IS NOT NULL AND ${t.ownerUserId} IS NULL)`,
    ),
    check("stored_file_size", sql`${t.size} > 0 AND ${t.size} <= 5242880`),
    check("stored_file_image_type", sql`${t.purpose} = 'file' OR ${t.contentType} = 'image/webp'`),
    unique("stored_file_user_purpose").on(t.id, t.ownerUserId, t.purpose),
    unique("stored_file_organization_purpose").on(t.id, t.organizationId, t.purpose),
  ],
);

// Durable candidates allow cleanup after a process crashes between S3 and the database commit.
export const storageCandidates = pgTable("storage_candidates", {
  objectKey: text("object_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userPictures = pgTable(
  "user_pictures",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull(),
    purpose: text("purpose").default("avatar").notNull(),
  },
  (t) => [
    check("user_picture_purpose", sql`${t.purpose} = 'avatar'`),
    foreignKey({
      name: "user_picture_file_owner_fk",
      columns: [t.fileId, t.userId, t.purpose],
      foreignColumns: [storedFiles.id, storedFiles.ownerUserId, storedFiles.purpose],
    }),
  ],
);

export const organizationPictures = pgTable(
  "organization_pictures",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull(),
    purpose: text("purpose").default("organization-logo").notNull(),
  },
  (t) => [
    check("organization_picture_purpose", sql`${t.purpose} = 'organization-logo'`),
    foreignKey({
      name: "organization_picture_file_owner_fk",
      columns: [t.fileId, t.organizationId, t.purpose],
      foreignColumns: [storedFiles.id, storedFiles.organizationId, storedFiles.purpose],
    }),
  ],
);
