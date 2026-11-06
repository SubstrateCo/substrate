import type { Database, DatabaseExecutor } from "./client";
import { RepositoryContext, type ActorScope } from "./core/repository-context";
import { contactRepository } from "./core/contacts/repository";
import { entityRepository } from "./core/entities/repository";
import { linkRepository } from "./core/links/repository";
import { permissionRepository } from "./core/permissions/repository";
import { emailAccountRepository } from "./features/email/accounts.repository";
import { emailConversationRepository } from "./features/email/conversations.repository";
import { emailMessageRepository } from "./features/email/messages.repository";
import { calendarRepository } from "./features/calendar/calendars.repository";
import { calendarEventRepository } from "./features/calendar/events.repository";
import { emailIntegrationRepository } from "./features/email/integrations.repository";
import { calendarIntegrationRepository } from "./features/calendar/integrations.repository";
import { projectRepository } from "./features/projects/repository";
import { taskRepository } from "./features/tasks/repository";

class ActorRepositories {
  readonly contacts;
  readonly entities;
  readonly links;
  readonly permissions;
  readonly emailAccounts;
  readonly emailConversations;
  readonly emailMessages;
  readonly calendars;
  readonly calendarEvents;
  readonly emailIntegrations;
  readonly calendarIntegrations;
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
    this.emailAccounts = emailAccountRepository(this.context);
    this.emailConversations = emailConversationRepository(this.context);
    this.emailMessages = emailMessageRepository(this.context);
    this.calendars = calendarRepository(this.context);
    this.calendarEvents = calendarEventRepository(this.context);
    this.emailIntegrations = emailIntegrationRepository(this.context);
    this.calendarIntegrations = calendarIntegrationRepository(this.context);
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
  };
}
