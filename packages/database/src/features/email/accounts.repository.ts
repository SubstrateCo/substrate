import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { emailAccounts } from "./accounts.schema";

export function emailAccountRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(input: { displayName: string; emailAddress: string }) {
      return db.transaction(async (tx) => {
        const entity = await new RepositoryContext(tx, scope).createEntity("email_account");
        const [account] = await tx
          .insert(emailAccounts)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            displayName: input.displayName,
            emailAddress: input.emailAddress.trim().toLowerCase(),
          })
          .returning();
        return account!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [account] = await db
        .select()
        .from(emailAccounts)
        .where(
          and(
            eq(emailAccounts.organizationId, scope.organizationId),
            eq(emailAccounts.entityId, entityId),
          ),
        );
      if (!account) throw new AccessDeniedError();
      return account;
    },
    async list(options: { limit?: number; afterEntityId?: string } = {}) {
      await context.requireActiveActor();
      return db
        .select()
        .from(emailAccounts)
        .where(
          and(
            eq(emailAccounts.organizationId, scope.organizationId),
            inArray(emailAccounts.entityId, context.readableEntities()),
            options.afterEntityId ? gt(emailAccounts.entityId, options.afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(emailAccounts.entityId))
        .limit(pageSize(options.limit));
    },
    async update(entityId: string, input: { displayName: string }) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        const [account] = await tx
          .update(emailAccounts)
          .set({ displayName: input.displayName })
          .where(
            and(
              eq(emailAccounts.organizationId, scope.organizationId),
              eq(emailAccounts.entityId, entityId),
            ),
          )
          .returning();
        if (!account) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return account;
      });
    },
  };
}
