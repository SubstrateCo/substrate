import { AccessDeniedError } from "../../errors";
import { entities } from "../entities/schema";
import { RepositoryContext, pageSize } from "../repository-context";
import { parseInput } from "./inputs";
import { contactInteractions } from "./interactions.schema";
import { contacts } from "./schema";
import { and, desc, eq, sql } from "drizzle-orm";
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

  return {
    async createManual(input: InteractionInput) {
      const value = parseInput(interactionInput, input);
      return context.transaction(async (ctx) => {
        await ctx.lockAccessPath(value.contactEntityId);
        const parent = await ctx.requireAccess(value.contactEntityId, "edit", true);
        if (
          parent.entity.entityType !== "contact" ||
          parent.entity.accessEntityId !== value.contactEntityId
        )
          throw new AccessDeniedError();
        const [contact] = await ctx.db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, scope.organizationId),
              eq(contacts.entityId, value.contactEntityId),
            ),
          );
        if (!contact) throw new AccessDeniedError();
        const entity = await ctx.createChildEntity("contact_interaction", parent);
        const [row] = await ctx.db
          .insert(contactInteractions)
          .values({
            ...value,
            entityId: entity.entityId,
            entityType: "contact_interaction",
            organizationId: scope.organizationId,
            origin: "manual",
            createdByActorEntityId: scope.actorEntityId,
          })
          .returning();
        await ctx.touch(value.contactEntityId);
        return row!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [row] = await db.select().from(contactInteractions).where(target(entityId));
      if (!row) throw new AccessDeniedError();
      await requireContact(context, row.contactEntityId, "view");
      return row;
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
      return rows;
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
        return row!;
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
