import type { DatabaseExecutor } from "./client";
import { contactRepository } from "./core/contacts/repository";
import { registerDevice, touchDevice } from "./core/devices/repository";
import { RepositoryEffects, commit, commitWrites } from "./core/effects";
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

function standalone(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  repositories: WorkspaceRepositories,
) {
  const transaction = <T>(work: (repositories: WorkspaceRepositories) => Promise<T>) =>
    commit(db, async (tx) => {
      const { context } = await workspaceContext(tx, identity);
      return work(new WorkspaceRepositories(context, identity));
    });
  function domain<
    K extends
      | "contacts"
      | "entities"
      | "links"
      | "permissions"
      | "projects"
      | "tasks"
      | "messaging"
      | "context"
      | "sharing"
      | "feed"
      | "files",
    W extends keyof WorkspaceRepositories[K],
  >(key: K, writes: readonly W[]) {
    return commitWrites(repositories[key], writes, (work) => transaction((tx) => work(tx[key])));
  }
  return {
    contacts: domain("contacts", ["create", "update"]),
    entities: domain("entities", ["softDelete"]),
    links: domain("links", ["create", "remove"]),
    permissions: domain("permissions", ["grant", "revoke"]),
    projects: domain("projects", ["create", "update", "delete", "revoke", "setPicture"]),
    tasks: domain("tasks", [
      "create",
      "update",
      "delete",
      "move",
      "addComment",
      "addLink",
      "removeLink",
    ]),
    messaging: domain("messaging", [
      "createConversation",
      "sendMessage",
      "toggleReaction",
      "addAgent",
      "removeAgent",
      "addMembers",
      "joinConversation",
      "leaveConversation",
      "transferOwnership",
      "deleteConversation",
    ]),
    context: domain("context", ["createTaskFromMessage", "attach", "detach"]),
    sharing: domain("sharing", [
      "invite",
      "accept",
      "decline",
      "revoke",
      "resend",
      "disconnect",
      "remove",
    ]),
    feed: domain("feed", ["markRead", "markAllRead", "markGroupRead"]),
    files: domain("files", ["addTask", "removeTask"]),
    transaction,
  };
}

export function createRepositories(db: DatabaseExecutor) {
  return {
    async forOwnerSession(identity: OwnerSessionIdentity) {
      const owner = await ownerSession(db, identity);
      const agents = createAgentRepository(db, owner.userId, owner.installationId);
      const devices = {
        register: (input: Parameters<typeof registerDevice>[2]) =>
          registerDevice(db, owner.userId, input),
        touch: (installationId: string) => touchDevice(db, owner.userId, installationId),
      };
      const sharing = {
        invitation: (id: string) => readSharingInvitation(db, owner.userId, id),
        decline: (id: string) => declineSharingInvitation(db, owner.userId, id),
        accept: (id: string, organizationId: string, shareHistory: boolean) =>
          createSharingService(db, { userId: owner.userId, organizationId }).accept(
            id,
            shareHistory,
          ),
      };
      return {
        agents: commitWrites(
          agents,
          ["saveAgent", "deleteAgent", "setPicture", "setHomeDevice", "saveTriggers"],
          (work) =>
            commit(db, async (tx) => {
              await ownerSession(tx, identity);
              return work(createAgentRepository(tx, owner.userId, owner.installationId));
            }),
        ),
        devices: commitWrites(devices, ["register", "touch"], (work) =>
          commit(db, async (tx) => {
            await ownerSession(tx, identity);
            return work({
              register: (input) => registerDevice(tx, owner.userId, input),
              touch: (id) => touchDevice(tx, owner.userId, id),
            });
          }),
        ),
        sharing: commitWrites(sharing, ["decline", "accept"], (work) =>
          commit(db, async (tx) => {
            await ownerSession(tx, identity);
            return work({
              invitation: (id) => readSharingInvitation(tx, owner.userId, id),
              decline: (id) => declineSharingInvitation(tx, owner.userId, id),
              accept: (id, organizationId, shareHistory) =>
                createSharingService(tx, { userId: owner.userId, organizationId }).accept(
                  id,
                  shareHistory,
                ),
            });
          }),
        ),
      };
    },
    async forSession(identity: SessionIdentity) {
      const { context } = await workspaceContext(db, identity);
      const session = Object.freeze({ ...identity });
      return standalone(db, session, new WorkspaceRepositories(context, session));
    },
  };
}
