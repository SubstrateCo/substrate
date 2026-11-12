import { AccessDeniedError, ValidationError } from "../../errors";
import { entities } from "../entities/schema";
import { RepositoryContext, pageSize } from "../repository-context";
import { parseInput } from "./inputs";
import { contactInteractions } from "./interactions.schema";
import { contacts } from "./schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const interactionInput = z
  .object({
    contactEntityId: z.uuid(),
    kind: z.enum(["email", "meeting", "call", "message", "note", "other"]),
    occurredAt: z.date(),
    endedAt: z.date().nullable().optional(),
    summary: z.string().trim().min(1).max(10000),
  })
  .refine(
    (value) => !value.endedAt || value.endedAt >= value.occurredAt,
    "The end must not precede the start.",
  );
type InteractionInput = z.input<typeof interactionInput>;
const timelineCursor = z.object({ occurredAt: z.date(), entityId: z.uuid() });
type TimelineOptions = { limit?: number; before?: z.input<typeof timelineCursor> };

export function contactInteractionRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const target = (entityId: string) =>
    and(
      eq(contactInteractions.organizationId, scope.organizationId),
      eq(contactInteractions.entityId, entityId),
    );

  async function presentRows(rows: (typeof contactInteractions.$inferSelect)[], ctx = context) {
    const sourceIds = [
      ...new Set(rows.flatMap((row) => (row.sourceEntityId ? [row.sourceEntityId] : []))),
    ];
    const sources = sourceIds.length
      ? await ctx.db
          .select({ entityId: entities.entityId, entityType: entities.entityType })
          .from(entities)
          .where(
            and(
              eq(entities.organizationId, scope.organizationId),
              inArray(entities.entityId, sourceIds),
              ctx.readable(entities.entityId),
            ),
          )
      : [];
    const byId = new Map(sources.map((source) => [source.entityId, source]));
    return rows.map(({ sourceEntityId, sourceEntityType: _sourceEntityType, ...entry }) => ({
      ...entry,
      source: sourceEntityId ? (byId.get(sourceEntityId) ?? null) : null,
    }));
  }

  async function present(row: typeof contactInteractions.$inferSelect, ctx = context) {
    return (await presentRows([row], ctx))[0]!;
  }

  async function requireContact(
    ctx: RepositoryContext,
    id: string,
    minimum: "view" | "edit",
    lock = false,
  ) {
    const access = await ctx.requireAccess(id, minimum, lock);
    if (access.entity.entityType !== "contact") throw new AccessDeniedError();
    const [contact] = await ctx.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, id)));
    if (!contact) throw new AccessDeniedError();
    return access;
  }

  async function create(input: InteractionInput, sourceEntityId?: string) {
    const value = parseInput(interactionInput, input);
    return context.transaction(async (ctx) => {
      await ctx.lockAccessPaths([
        value.contactEntityId,
        ...(sourceEntityId ? [sourceEntityId] : []),
      ]);
      const parent = await ctx.requireAccess(value.contactEntityId, "edit", true);
      if (
        parent.entity.entityType !== "contact" ||
        parent.entity.accessEntityId !== value.contactEntityId
      )
        throw new AccessDeniedError();
      // Serialize imports for a contact so retries cannot leave orphan interaction entities.
      const [contact] = await ctx.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            eq(contacts.entityId, value.contactEntityId),
          ),
        )
        .for("update");
      if (!contact) throw new AccessDeniedError();
      let sourceType: typeof entities.$inferSelect.entityType | null = null;
      if (sourceEntityId) {
        const source = await ctx.requireAccess(sourceEntityId, "view");
        // These domains use the shared entity access policy. Add other source types only with
        // their domain-specific read checks; enum-only email/calendar domains are not sources.
        if (!["contact", "project", "task"].includes(source.entity.entityType))
          throw new ValidationError("This source type is not supported for contact publication.");
        sourceType = source.entity.entityType;
        const [existing] = await ctx.db
          .select()
          .from(contactInteractions)
          .where(
            and(
              eq(contactInteractions.organizationId, scope.organizationId),
              eq(contactInteractions.contactEntityId, value.contactEntityId),
              eq(contactInteractions.sourceEntityId, sourceEntityId),
            ),
          );
        if (existing) {
          await ctx.requireAccess(existing.entityId, "view");
          return present(existing, ctx);
        }
      }
      const entity = await ctx.createChildEntity("contact_interaction", parent);
      const [row] = await ctx.db
        .insert(contactInteractions)
        .values({
          ...value,
          entityId: entity.entityId,
          entityType: "contact_interaction",
          organizationId: scope.organizationId,
          origin: sourceEntityId ? "imported" : "manual",
          sourceEntityId: sourceEntityId ?? null,
          sourceEntityType: sourceType,
          createdByActorEntityId: scope.actorEntityId,
        })
        .returning();
      await ctx.touch(value.contactEntityId);
      return present(row!, ctx);
    });
  }

  return {
    createManual(input: InteractionInput) {
      return create(input);
    },
    async publishFromSource(input: InteractionInput & { sourceEntityId: string }) {
      return create(input, parseInput(z.uuid(), input.sourceEntityId));
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [row] = await db.select().from(contactInteractions).where(target(entityId));
      if (!row) throw new AccessDeniedError();
      await requireContact(context, row.contactEntityId, "view");
      return present(row);
    },
    async listForContact(contactEntityId: string, options: TimelineOptions = {}) {
      await requireContact(context, contactEntityId, "view");
      const cursor = options.before ? parseInput(timelineCursor, options.before) : undefined;
      const rows = await db
        .select()
        .from(contactInteractions)
        .where(
          and(
            eq(contactInteractions.organizationId, scope.organizationId),
            eq(contactInteractions.contactEntityId, contactEntityId),
            context.readable(contactInteractions.entityId),
            cursor
              ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.entityId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
        .limit(pageSize(options.limit));
      return presentRows(rows);
    },
    async listForSource(sourceEntityId: string, options: TimelineOptions = {}) {
      await context.requireAccess(sourceEntityId, "view");
      const cursor = options.before ? parseInput(timelineCursor, options.before) : undefined;
      const rows = await db
        .select()
        .from(contactInteractions)
        .where(
          and(
            eq(contactInteractions.organizationId, scope.organizationId),
            eq(contactInteractions.sourceEntityId, sourceEntityId),
            context.readable(contactInteractions.entityId),
            context.readable(contactInteractions.contactEntityId),
            cursor
              ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.entityId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
        .limit(pageSize(options.limit));
      return presentRows(rows);
    },
    async update(entityId: string, input: { summary: string }) {
      const value = parseInput(z.object({ summary: z.string().trim().min(1).max(10000) }), input);
      return context.transaction(async (ctx) => {
        await ctx.requireAccess(entityId, "edit", true, "structural");
        const [existing] = await ctx.db.select().from(contactInteractions).where(target(entityId));
        if (!existing) throw new AccessDeniedError();
        await requireContact(ctx, existing.contactEntityId, "edit", true);
        const [row] = await ctx.db
          .update(contactInteractions)
          .set(value)
          .where(target(entityId))
          .returning();
        await ctx.touch(entityId);
        await ctx.touch(existing.contactEntityId);
        return present(row!, ctx);
      });
    },
    async softDelete(entityId: string) {
      return context.transaction(async (ctx) => {
        await ctx.requireAccess(entityId, "owner", true, "structural");
        const [existing] = await ctx.db.select().from(contactInteractions).where(target(entityId));
        if (!existing) throw new AccessDeniedError();
        await requireContact(ctx, existing.contactEntityId, "view");
        await ctx.db
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, entityId)),
          );
        await ctx.touch(existing.contactEntityId);
      });
    },
  };
}
