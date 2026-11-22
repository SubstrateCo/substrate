import { AccessDeniedError } from "../../errors";
import { entities } from "../entities/schema";
import {
  RepositoryContext,
  pageSize,
  type AuthorizedAccess,
  type EntityAccess,
} from "../repository-context";
import {
  deletableAuthors,
  interactionReadable,
  requireContact,
  requireInteraction,
} from "./access";
import { parseInput } from "./inputs";
import { interactionWorkspaceRepository } from "./interaction-workspace.repository";
import { contactInteractions } from "./interactions.schema";
import { contacts } from "./schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
type CheckedInteraction = Awaited<ReturnType<typeof requireInteraction>>;

export function contactInteractionRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const target = (entityId: string) =>
    and(
      eq(contactInteractions.organizationId, scope.organizationId),
      eq(contactInteractions.entityId, entityId),
    );

  return {
    ...interactionWorkspaceRepository(context),
    /** `checked` is the caller's requireContact in this transaction. */
    async createManual(input: InteractionInput, checked?: AuthorizedAccess<"edit">) {
      const value = parseInput(interactionInput, input);
      return context.transaction(async (ctx) => {
        const parent =
          checked?.entity.entityId === value.contactEntityId
            ? checked
            : await requireContact(ctx, value.contactEntityId);
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
    /** `checked` is the caller's requireInteraction(entityId) in this transaction. */
    async update(entityId: string, input: { summary: string }, checked?: CheckedInteraction) {
      const value = parseInput(z.object({ summary: z.string().trim().min(1).max(10000) }), input);
      return context.transaction(async (ctx) => {
        const { interaction: existing } =
          checked?.interaction.entityId === entityId
            ? checked
            : await requireInteraction(ctx, entityId);
        // The liveness condition makes an edit lose to a deletion that committed after the check.
        const [row] = await ctx.db
          .update(contactInteractions)
          .set(value)
          .where(and(target(entityId), interactionReadable(ctx, contactInteractions.entityId)))
          .returning();
        if (!row) throw new AccessDeniedError();
        await ctx.touch(entityId);
        await ctx.touch(existing.contactEntityId);
        return row;
      });
    },
    async softDelete(entityId: string) {
      return context.transaction(async (ctx) => {
        const { interaction: existing } = await requireInteraction(ctx, entityId);
        const author = existing.createdByActorEntityId;
        if (!(await deletableAuthors(ctx, [author])).has(author)) throw new AccessDeniedError();
        // Only one of two concurrent deletions writes the row.
        const deleted = await ctx.db
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(entities.organizationId, scope.organizationId),
              eq(entities.entityId, entityId),
              isNull(entities.deletedAt),
            ),
          )
          .returning({ entityId: entities.entityId });
        if (!deleted.length) throw new AccessDeniedError();
        await ctx.touch(existing.contactEntityId);
        return existing;
      });
    },
  };
}
