import type { DatabaseExecutor } from "./client";
import { contactRepository } from "./core/contacts/repository";
import { registerDevice, touchDevice } from "./core/devices/repository";
import { RepositoryEffects } from "./core/effects";
import type { Committed } from "./core/effects";
import { entityRepository } from "./core/entities/repository";
import { linkRepository } from "./core/links/repository";
import { permissionRepository } from "./core/permissions/repository";
import { RepositoryContext, type ActorScope } from "./core/repository-context";
import type { SessionIdentity, OwnerSessionIdentity } from "./core/session/identity";
import { ownerSession } from "./core/session/owner";
import { workspaceContext } from "./core/session/workspace";
import { createAgentRepository } from "./features/agents/repository";
import { createContextService } from "./features/context/service";
import { createAttachmentRepository } from "./features/files/repository";
import { createMessagingService } from "./features/messaging/service";
import {
  readSharingInvitation,
  declineSharingInvitation,
} from "./features/messaging/sharing/invitations";
import { createSharingService } from "./features/messaging/sharing/service";
import { createFeedService } from "./features/notifications/service";
import { projectRepository } from "./features/projects/repository";
import { taskRepository } from "./features/tasks/repository";

export class ActorRepositories {
  readonly contacts;
  readonly entities;
  readonly links;
  readonly permissions;
  readonly projects;
  readonly tasks;
  protected readonly repositoryContext;

  constructor(
    protected readonly db: DatabaseExecutor,
    scope: ActorScope,
    effects = new RepositoryEffects(),
  ) {
    this.repositoryContext = new RepositoryContext(db, scope, effects);
    this.contacts = contactRepository(this.repositoryContext);
    this.entities = entityRepository(this.repositoryContext);
    this.links = linkRepository(this.repositoryContext);
    this.permissions = permissionRepository(this.repositoryContext);
    this.projects = projectRepository(this.repositoryContext);
    this.tasks = taskRepository(this.repositoryContext);
  }

  async transaction<T>(
    work: (repositories: ActorRepositories) => Promise<T>,
  ): Promise<Committed<T>> {
    const effects = new RepositoryEffects();
    const result = await this.db.transaction((tx) =>
      work(new ActorRepositories(tx, this.repositoryContext.scope, effects)),
    );
    this.repositoryContext.effects.merge(effects);
    return effects.committed(result);
  }
}

class WorkspaceRepositories extends ActorRepositories {
  readonly messaging;
  readonly context;
  readonly sharing;
  readonly feed;
  readonly files;

  constructor(
    context: RepositoryContext,
    private readonly identity: SessionIdentity,
  ) {
    super(context.db, context.scope, context.effects);
    this.messaging = createMessagingService(context.db, identity);
    this.context = createContextService(context.db, identity, context);
    this.sharing = createSharingService(context.db, identity);
    this.feed = createFeedService(context.db, identity);
    this.files = createAttachmentRepository(context);
  }

  override async transaction<T>(
    work: (repositories: WorkspaceRepositories) => Promise<T>,
  ): Promise<Committed<T>> {
    const effects = new RepositoryEffects();
    const result = await this.db.transaction(async (tx) => {
      const { context } = await workspaceContext(tx, this.identity);
      return work(
        new WorkspaceRepositories(new RepositoryContext(tx, context.scope, effects), this.identity),
      );
    });
    this.repositoryContext.effects.merge(effects);
    return effects.committed(result);
  }
}

export function createRepositories(db: DatabaseExecutor) {
  return {
    async forOwnerSession(identity: OwnerSessionIdentity) {
      const owner = await ownerSession(db, identity);
      return {
        agents: createAgentRepository(db, owner.userId, owner.installationId),
        devices: {
          register: (input: Parameters<typeof registerDevice>[2]) =>
            registerDevice(db, owner.userId, input),
          touch: (installationId: string) => touchDevice(db, owner.userId, installationId),
        },
        sharing: {
          invitation: (id: string) => readSharingInvitation(db, owner.userId, id),
          decline: (id: string) => declineSharingInvitation(db, owner.userId, id),
        },
      };
    },
    async forSession(identity: SessionIdentity) {
      const { context } = await workspaceContext(db, identity);
      return new WorkspaceRepositories(context, Object.freeze({ ...identity }));
    },
  };
}
