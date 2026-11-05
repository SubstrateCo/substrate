import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { emailConversationRepository } from "./conversations.repository";
import { emailMessages } from "./messages.schema";
import { emailParticipantRepository } from "./participants.repository";

type MessageContent = Pick<typeof emailMessages.$inferInsert, "subject" | "textBody" | "htmlBody">;
type CreateMessage = MessageContent &
  Pick<
    typeof emailMessages.$inferInsert,
    | "conversationEntityId"
    | "direction"
    | "providerMessageId"
    | "internetMessageId"
    | "sentAt"
    | "receivedAt"
  >;

export function emailMessageRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(input: CreateMessage) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const conversation = await emailConversationRepository(ctx).get(input.conversationEntityId);
        const entity = await ctx.createEntity("email_message", conversation.entityId);
        const [message] = await tx
          .insert(emailMessages)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            emailAccountEntityId: conversation.emailAccountEntityId,
            conversationEntityId: conversation.entityId,
            subject: input.subject,
            textBody: input.textBody,
            htmlBody: input.htmlBody,
            direction: input.direction,
            providerMessageId: input.providerMessageId,
            internetMessageId: input.internetMessageId,
            sentAt: input.sentAt,
            receivedAt: input.receivedAt,
          })
          .returning();
        return message!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [message] = await db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.organizationId, scope.organizationId),
            eq(emailMessages.entityId, entityId),
          ),
        );
      if (!message) throw new AccessDeniedError();
      return message;
    },
    async list(
      conversationEntityId: string,
      options: { limit?: number; afterEntityId?: string } = {},
    ) {
      await emailConversationRepository(context).get(conversationEntityId);
      return db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.organizationId, scope.organizationId),
            eq(emailMessages.conversationEntityId, conversationEntityId),
            inArray(emailMessages.entityId, context.readableEntities()),
            options.afterEntityId ? gt(emailMessages.entityId, options.afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(emailMessages.entityId))
        .limit(pageSize(options.limit));
    },
    async update(entityId: string, input: MessageContent) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        const [message] = await tx
          .update(emailMessages)
          .set({ subject: input.subject, textBody: input.textBody, htmlBody: input.htmlBody })
          .where(
            and(
              eq(emailMessages.organizationId, scope.organizationId),
              eq(emailMessages.entityId, entityId),
            ),
          )
          .returning();
        if (!message) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return message;
      });
    },
    ...emailParticipantRepository(context),
  };
}
