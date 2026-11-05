import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { RepositoryContext } from "../../core/repository-context";
import { emailParticipants } from "./participants.schema";

type ParticipantInput = Pick<
  typeof emailParticipants.$inferInsert,
  "kind" | "address" | "displayName" | "contactEntityId"
>;

export function emailParticipantRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async addParticipant(emailMessageEntityId: string, input: ParticipantInput) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const { entity } = await ctx.requireAccess(emailMessageEntityId, "edit", true);
        if (entity.entityType !== "email_message") throw new Error("Expected an email message.");
        if (input.contactEntityId) await ctx.requireAccess(input.contactEntityId, "view");
        await tx
          .insert(emailParticipants)
          .values({
            organizationId: scope.organizationId,
            emailMessageEntityId,
            kind: input.kind,
            address: input.address.trim().toLowerCase(),
            displayName: input.displayName,
            contactEntityId: input.contactEntityId,
          })
          .onConflictDoUpdate({
            target: [
              emailParticipants.organizationId,
              emailParticipants.emailMessageEntityId,
              emailParticipants.kind,
              emailParticipants.address,
            ],
            set: {
              displayName: input.displayName ?? null,
              contactEntityId: input.contactEntityId ?? null,
            },
          });
        await ctx.touch(emailMessageEntityId);
      });
    },
    async listParticipants(emailMessageEntityId: string) {
      await context.requireAccess(emailMessageEntityId, "view");
      return db
        .select({
          kind: emailParticipants.kind,
          address: emailParticipants.address,
          displayName: emailParticipants.displayName,
          contactEntityId: sql<
            string | null
          >`CASE WHEN ${inArray(emailParticipants.contactEntityId, context.readableEntities())} THEN ${emailParticipants.contactEntityId} ELSE NULL END`,
        })
        .from(emailParticipants)
        .where(
          and(
            eq(emailParticipants.organizationId, scope.organizationId),
            eq(emailParticipants.emailMessageEntityId, emailMessageEntityId),
          ),
        )
        .orderBy(asc(emailParticipants.kind), asc(emailParticipants.address));
    },
    async removeParticipant(
      emailMessageEntityId: string,
      input: Pick<ParticipantInput, "kind" | "address">,
    ) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(emailMessageEntityId, "edit", true);
        await tx
          .delete(emailParticipants)
          .where(
            and(
              eq(emailParticipants.organizationId, scope.organizationId),
              eq(emailParticipants.emailMessageEntityId, emailMessageEntityId),
              eq(emailParticipants.kind, input.kind),
              eq(emailParticipants.address, input.address.trim().toLowerCase()),
            ),
          );
        await ctx.touch(emailMessageEntityId);
      });
    },
  };
}
