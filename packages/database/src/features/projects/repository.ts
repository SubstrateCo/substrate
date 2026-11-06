import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { projects, projectStatuses } from "./schema";

export function requiredText(value: string, maximum: number) {
  if (!value.trim() || value.trim().length > maximum)
    throw new ValidationError(`Enter text between 1 and ${maximum} characters.`);
  return value.trim();
}

export function projectRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const projectWhere = (id: string) =>
    and(eq(projects.organizationId, scope.organizationId), eq(projects.entityId, id));
  async function get(entityId: string) {
    await context.requireAccess(entityId, "view");
    const [project] = await db.select().from(projects).where(projectWhere(entityId));
    if (!project) throw new AccessDeniedError();
    return project;
  }
  return {
    get,
    async create(input: { name: string; description?: string }) {
      const name = requiredText(input.name, 200);
      return db.transaction(async (tx) => {
        const entity = await new RepositoryContext(tx, scope).createEntity("project");
        const [project] = await tx
          .insert(projects)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            name,
            description: input.description ?? "",
          })
          .returning();
        await tx.insert(projectStatuses).values(
          [
            { name: "Todo", category: "todo" as const },
            { name: "In progress", category: "active" as const },
            { name: "Done", category: "done" as const },
            { name: "Canceled", category: "canceled" as const },
          ].map((status, position) => ({
            ...status,
            position,
            organizationId: scope.organizationId,
            projectEntityId: entity.entityId,
          })),
        );
        return project!;
      });
    },
    async list() {
      await context.requireActiveActor();
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, scope.organizationId),
            inArray(projects.entityId, context.readableEntities()),
          ),
        )
        .orderBy(asc(projects.name), asc(projects.entityId));
    },
    async update(entityId: string, input: { name: string; description: string }) {
      const name = requiredText(input.name, 200);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        const [project] = await tx
          .update(projects)
          .set({ name, description: input.description })
          .where(projectWhere(entityId))
          .returning();
        if (!project) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return project;
      });
    },
    async listStatuses(projectEntityId: string) {
      await get(projectEntityId);
      return db
        .select()
        .from(projectStatuses)
        .where(
          and(
            eq(projectStatuses.organizationId, scope.organizationId),
            eq(projectStatuses.projectEntityId, projectEntityId),
          ),
        )
        .orderBy(asc(projectStatuses.position), asc(projectStatuses.id));
    },
    async addStatus(
      projectEntityId: string,
      input: { name: string; category: typeof projectStatuses.$inferInsert.category },
    ) {
      const name = requiredText(input.name, 100);
      if (!["todo", "active", "done", "canceled"].includes(input.category))
        throw new ValidationError("Invalid status category.");
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(projectEntityId, "edit", true);
        const statuses = await projectRepository(ctx).listStatuses(projectEntityId);
        if (statuses.some((status) => status.name === name))
          throw new ValidationError("A status with that name already exists.");
        const [status] = await tx
          .insert(projectStatuses)
          .values({
            organizationId: scope.organizationId,
            projectEntityId,
            name,
            category: input.category,
            position: statuses.length,
          })
          .returning();
        return status!;
      });
    },
    async listMembers(projectEntityId: string) {
      await get(projectEntityId);
      return db
        .select({
          actorEntityId: actors.entityId,
          name: actors.name,
          type: actors.type,
          level: entityGrants.level,
        })
        .from(entityGrants)
        .innerJoin(
          actors,
          and(
            eq(actors.organizationId, entityGrants.organizationId),
            eq(actors.entityId, entityGrants.actorEntityId),
          ),
        )
        .where(
          and(
            eq(entityGrants.organizationId, scope.organizationId),
            eq(entityGrants.entityId, projectEntityId),
          ),
        )
        .orderBy(asc(actors.name));
    },
    async availableActors(projectEntityId: string) {
      await get(projectEntityId);
      // Organization actors are discoverable only inside an accessible project, not across organizations.
      return db
        .select({ entityId: actors.entityId, name: actors.name, type: actors.type })
        .from(actors)
        .innerJoin(entities, eq(entities.entityId, actors.entityId))
        .leftJoin(
          member,
          and(eq(member.organizationId, actors.organizationId), eq(member.userId, actors.userId)),
        )
        .where(
          and(
            eq(actors.organizationId, scope.organizationId),
            isNull(actors.disabledAt),
            isNull(entities.deletedAt),
            or(eq(actors.type, "agent"), sql`${member.id} IS NOT NULL`),
          ),
        )
        .orderBy(asc(actors.name), asc(actors.entityId));
    },
  };
}
