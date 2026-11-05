import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { emailAccountRepository } from "./accounts.repository";
import { emailConversations } from "./conversations.schema";

export function emailConversationRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(input: {
      emailAccountEntityId: string;
      subject: string;
      providerConversationId?: string;
    }) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await emailAccountRepository(ctx).get(input.emailAccountEntityId);
        const entity = await ctx.createEntity("email_conversation", input.emailAccountEntityId);
        const [conversation] = await tx
          .insert(emailConversations)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            emailAccountEntityId: input.emailAccountEntityId,
            subject: input.subject,
            providerConversationId: input.providerConversationId,
          })
          .returning();
        return conversation!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [conversation] = await db
        .select()
        .from(emailConversations)
        .where(
          and(
            eq(emailConversations.organizationId, scope.organizationId),
            eq(emailConversations.entityId, entityId),
          ),
        );
      if (!conversation) throw new AccessDeniedError();
      return conversation;
    },
    async list(
      emailAccountEntityId: string,
      options: { limit?: number; afterEntityId?: string } = {},
    ) {
      await emailAccountRepository(context).get(emailAccountEntityId);
      return db
        .select()
        .from(emailConversations)
        .where(
          and(
            eq(emailConversations.organizationId, scope.organizationId),
            eq(emailConversations.emailAccountEntityId, emailAccountEntityId),
            inArray(emailConversations.entityId, context.readableEntities()),
            options.afterEntityId
              ? gt(emailConversations.entityId, options.afterEntityId)
              : undefined,
          ),
        )
        .orderBy(asc(emailConversations.entityId))
        .limit(pageSize(options.limit));
    },
  };
}
