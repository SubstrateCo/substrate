import { AccessDeniedError } from "../../errors";
import { entities } from "../entities/schema";
import {
  RepositoryContext,
  pageSize,
  type EntityAccess,
  type LockedAccess,
} from "../repository-context";
import {
  deletableAuthors,
  interactionReadable,
  lockContact,
  requireContact,
  requireInteraction,
} from "./access";
import { parseInput } from "./inputs";
import { interactionWorkspaceRepository } from "./interaction-workspace.repository";
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
type LockedInteraction = Awaited<ReturnType<typeof requireInteraction>> & {
  contact: LockedAccess<"edit">;
};

export function contactInteractionRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const target = (entityId: string) =>
    and(
      eq(contactInteractions.organizationId, scope.organizationId),
      eq(contactInteractions.entityId, entityId),
    );

  return {
    ...interactionWorkspaceRepository(context),
    /** `locked` is the contact lock the caller holds in this transaction. */
    async createManual(input: InteractionInput, locked?: LockedAccess<"edit">) {
      const value = parseInput(interactionInput, input);
      return context.transaction(async (ctx) => {
        const parent =
          locked?.entity.entityId === value.contactEntityId
            ? locked
            : await lockContact(ctx, value.contactEntityId);
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
      return (await requireInteraction(context, entityId)).interaction;
    },
    /** `checked` is the caller's access to the contact, already read in this context. */
    async listForContact(
      contactEntityId: string,
      options: TimelineOptions = {},
      checked?: EntityAccess,
    ) {
      if (checked?.entity.entityId !== contactEntityId || checked.entity.entityType !== "contact")
        await requireContact(context, contactEntityId);
      const cursor = options.before ? parseInput(timelineCursor, options.before) : undefined;
      const rows = await db
        .select()
        .from(contactInteractions)
        .where(
          and(
            eq(contactInteractions.organizationId, scope.organizationId),
            eq(contactInteractions.contactEntityId, contactEntityId),
            interactionReadable(context, contactInteractions.entityId),
            cursor
              ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.entityId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
        .limit(pageSize(options.limit));
      return rows;
    },
    /** `locked` is the caller's requireInteraction(entityId, true) in this transaction. */
    async update(entityId: string, input: { summary: string }, locked?: LockedInteraction) {
      const value = parseInput(z.object({ summary: z.string().trim().min(1).max(10000) }), input);
      return context.transaction(async (ctx) => {
        const { interaction: existing } =
          locked?.interaction.entityId === entityId
            ? locked
            : await requireInteraction(ctx, entityId, true);
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
        const { interaction: existing } = await requireInteraction(ctx, entityId, true);
        const author = existing.createdByActorEntityId;
        if (!(await deletableAuthors(ctx, [author])).has(author)) throw new AccessDeniedError();
        await ctx.db
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, entityId)),
          );
        await ctx.touch(existing.contactEntityId);
        return existing;
      });
    },
  };
}
