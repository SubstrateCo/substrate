import type { Database, DatabaseExecutor } from "./client";
import { ensureUserAgentActor } from "./core/actors/provisioning";
import { contactRepository } from "./core/contacts/repository";
import { entityRepository } from "./core/entities/repository";
import { linkRepository } from "./core/links/repository";
import { permissionRepository } from "./core/permissions/repository";
import { RepositoryContext, type ActorScope } from "./core/repository-context";
import { projectRepository } from "./features/projects/repository";
import { taskRepository } from "./features/tasks/repository";

class ActorRepositories {
  readonly contacts;
  readonly entities;
  readonly links;
  readonly permissions;
  readonly projects;
  readonly tasks;
  private readonly context;

  constructor(
    private readonly db: DatabaseExecutor,
    scope: ActorScope,
  ) {
    this.context = new RepositoryContext(db, scope);
    this.contacts = contactRepository(this.context);
    this.entities = entityRepository(this.context);
    this.links = linkRepository(this.context);
    this.permissions = permissionRepository(this.context);
    this.projects = projectRepository(this.context);
    this.tasks = taskRepository(this.context);
  }

  transaction<T>(work: (repositories: ActorRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new ActorRepositories(tx, this.context.scope)));
  }
}

export function createRepositories(db: Database) {
  return {
    // Scope must come from a verified session or agent credential, never request input.
    forActor(scope: ActorScope) {
      return new ActorRepositories(db, scope);
    },
    // Owner and organization must come from a verified session or agent credential.
    async forUserAgent(input: { organizationId: string; userId: string; userAgentId: string }) {
      const actor = await ensureUserAgentActor(db, input);
      const scope = {
        organizationId: input.organizationId,
        actorEntityId: actor.entityId,
      };
      await new RepositoryContext(db, scope).requireActiveActor();
      return new ActorRepositories(db, scope);
    },
  };
}
