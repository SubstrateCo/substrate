import type { NotificationFilter } from "@substrate/contracts/context/notification-groups";
import type { RealtimeScope } from "@substrate/contracts/realtime";
/**
 * Query keys of the web client (apps/web/src/queries/keys.ts), the subset the load test mounts.
 * The prefixes match the web's, so a hint invalidates the same queries as in the app.
 */
export type QueryKey = readonly string[];

const organization = (org: string) => ["organizations", org] as const;
const messaging = (org: string) => [...organization(org), "messaging"] as const;
const context = (org: string) => [...organization(org), "context"] as const;
const tasks = (org: string) => [...organization(org), "tasks"] as const;
const user = (userId: string) => ["users", userId] as const;
const optional = (value?: string) => (value ? [value] : []);

export const keys = {
  session: ["auth", "session"],
  organizationDetail: (org: string) => [...organization(org), "detail"],
  // Under the detail key, as on the web, so every detail refresh reaches them.
  organizationSummary: (org: string) => [...organization(org), "detail", "summary"],
  organizationPeople: (org: string) => [...organization(org), "detail", "people"],
  organization,

  agents: (userId: string) => [...user(userId), "agents"],
  agentWork: (userId: string, org?: string) => [...user(userId), "agent-work", ...optional(org)],
  agentWorkStatus: (userId: string, org: string) => [...keys.agentWork(userId, org), "status"],
  agentWorkNeedsYou: (userId: string, org: string) => [...keys.agentWork(userId, org), "needs-you"],
  agentWorkRequests: (userId: string, org: string, conversationId: string) => [
    ...keys.agentWork(userId, org),
    "requests",
    conversationId,
  ],
  myAgentCalls: (userId: string, org: string, conversationId?: string) => [
    ...keys.agentWork(userId, org),
    "my-calls",
    ...optional(conversationId),
  ],

  messaging,
  messageUnread: (org: string) => [...messaging(org), "unread"],
  conversations: (org: string) => [...messaging(org), "conversations"],
  // Nested under conversations, as on the web, so conversation refreshes reach them.
  managedConversations: (org: string) => [...keys.conversations(org), "managed"],
  conversationSharing: (org: string, conversationId?: string) => [
    ...keys.conversations(org),
    "sharing",
    ...optional(conversationId),
  ],
  deleteImpact: (org: string, conversationId: string) => [
    ...keys.conversations(org),
    "delete-impact",
    conversationId,
  ],
  sharingInbox: (org: string) => [...messaging(org), "sharing-inbox"],
  sharingInvitation: (invitationId: string) => ["sharing-invitations", invitationId],
  organizations: ["organizations", "list"],
  organizationInvitations: (org: string) => [...organization(org), "invitations"],
  userInvitations: ["invitations", "user"],
  messagingProfiles: (org: string) => [...messaging(org), "profiles"],
  messagingProfile: (org: string, conversationId: string, actorId: string) => [
    ...messaging(org),
    "profiles",
    conversationId,
    actorId,
  ],
  conversationMessages: (org: string, conversationId?: string) => [
    ...messaging(org),
    "messages",
    ...optional(conversationId),
  ],
  /** One page of a conversation or thread; `cursor` is "latest" or "before:<id>". */
  messages: (org: string, conversationId: string, threadId: string | null, cursor = "latest") => [
    ...keys.conversationMessages(org, conversationId),
    threadId ?? "-",
    cursor,
  ],
  conversationReactions: (org: string, conversationId?: string) => [
    ...messaging(org),
    "reactions",
    ...optional(conversationId),
  ],
  messageReactions: (org: string, conversationId: string, messageId: string, emoji = "-") => [
    ...keys.conversationReactions(org, conversationId),
    messageId,
    emoji,
  ],

  context,
  messageTargets: (org: string, conversationId?: string) => [
    ...context(org),
    "target",
    ...optional(conversationId),
  ],
  messageTarget: (org: string, conversationId: string, messageId: string) => [
    ...keys.messageTargets(org, conversationId),
    messageId,
  ],
  related: (org: string, entityId?: string) => [...context(org), "related", ...optional(entityId)],
  activity: (org: string, entityId?: string) => [
    ...context(org),
    "activity",
    ...optional(entityId),
  ],
  messagePages: (org: string, conversationId?: string) => [
    ...context(org),
    "message-pages",
    ...optional(conversationId),
  ],
  /** Like the web key, it ends with the page's message IDs (joined, as keys hold strings). */
  messagePage: (org: string, conversationId: string, ids: string[]) => [
    ...keys.messagePages(org, conversationId),
    ids.join(","),
  ],
  /** Reads the message IDs back from a page key (queryKeys.messagePageIds). */
  messagePageIds: (key: QueryKey) =>
    key[keys.messagePages("org", "conversation").length]?.split(",") ?? [],
  notifications: (org: string) => [...context(org), "notifications"],
  notificationUnread: (org: string) => [...keys.notifications(org), "unread-status"],
  notificationGroups: (org: string, filter: NotificationFilter) => [
    ...keys.notifications(org),
    "groups",
    filter,
  ],
  notificationEvents: (org: string, groupKey?: string) => [
    ...keys.notifications(org),
    "events",
    ...optional(groupKey),
  ],
  /** Suffix with a stable text of the search input, as the web does with the input object. */
  search: (org: string) => [...context(org), "search"],
  searchPages: (org: string) => [...context(org), "search-pages"],

  tasks,
  projects: (org: string) => [...tasks(org), "projects"],
  project: (org: string, projectEntityId: string) => [...tasks(org), "project", projectEntityId],
  /** Every cached project detail. */
  projectDetails: (org: string) => [...tasks(org), "project"],
  taskAttachments: (org: string, projectEntityId: string, taskEntityId: string) => [
    ...tasks(org),
    "attachments",
    projectEntityId,
    taskEntityId,
  ],
  taskLocation: (org: string, taskEntityId: string) => [...tasks(org), "location", taskEntityId],
};

export interface HintTarget {
  prefix: QueryKey;
  /** Searches only become stale; an open search is not re-read (refetchType "none"). */
  staleOnly?: true;
  /** Message context pages: only those that show work links, or have no data yet. */
  withLinks?: true;
  /** Message context pages: only those whose key includes this message. */
  withMessage?: string;
  /** Related lists: only those that show a message of this conversation, or have no data yet. */
  inConversation?: string;
  /** Only keys that include this record ID after the prefix. */
  withId?: string;
  /** Message context pages: only those that link one of these tasks or projects, or have no data yet. */
  linksTo?: string[];
}

export interface ChangeEvent {
  type: "change";
  id: string;
  organizationId: string | null;
  domain: string;
  conversationId?: string;
  scope?: RealtimeScope;
  messageId?: string;
  /** null: the main timeline; absent: unknown. */
  threadId?: string | null;
  projectId?: string;
  taskIds?: string[];
}

type Scope = ChangeEvent["scope"];
type ChangeDetail = Partial<Pick<ChangeEvent, "messageId" | "threadId" | "projectId" | "taskIds">>;

/** The web's messages(org, C, T) key: one thread, or the main timeline, with all its pages. */
const history = (org: string, conversationId: string, threadId: string | null) => [
  ...keys.conversationMessages(org, conversationId),
  threadId ?? "-",
];

/** The web's messageReactions(org, C, M): every reaction query of one message. */
const reactionsOf = (org: string, conversationId: string, messageId: string) => [
  ...keys.conversationReactions(org, conversationId),
  messageId,
];

// Searches only become stale, so a change does not start a burst of search requests.
const searchTargets = (org: string): HintTarget[] =>
  [keys.search(org), keys.searchPages(org)].map((prefix) => ({ prefix, staleOnly: true }));

// targets.ts historyTargets: the history pages that show a changed message.
function historyTargets(
  org: string,
  conversationId: string | undefined,
  scope: Scope,
  { messageId, threadId }: ChangeDetail,
): HintTarget[] {
  if (!conversationId || threadId === undefined || (scope !== "messages" && !messageId))
    return [{ prefix: keys.conversationMessages(org, conversationId) }];
  const timeline = { prefix: history(org, conversationId, null) };
  if (threadId === null)
    return scope !== "messages" && messageId
      ? [timeline, { prefix: history(org, conversationId, messageId) }]
      : [timeline];
  const thread = { prefix: history(org, conversationId, threadId) };
  return scope === "messages" ? [thread, timeline] : [thread];
}

// targets.ts reactionTargets: one message's reactions.
function reactionTargets(
  org: string,
  conversationId: string,
  { messageId, threadId }: ChangeDetail,
): HintTarget[] {
  return [
    {
      prefix:
        threadId === undefined
          ? keys.conversationMessages(org, conversationId)
          : history(org, conversationId, threadId),
    },
    {
      prefix: messageId
        ? reactionsOf(org, conversationId, messageId)
        : keys.conversationReactions(org, conversationId),
    },
    { prefix: keys.messageTargets(org, conversationId) },
  ];
}

// targets.ts workTargets: a change to one project's tasks.
function workTargets(org: string, projectId: string, taskIds: string[] | undefined): HintTarget[] {
  const shared: HintTarget[] = searchTargets(org);
  if (!taskIds)
    return [
      { prefix: keys.projects(org) },
      { prefix: keys.tasks(org), withId: projectId },
      { prefix: [...keys.tasks(org), "location"] },
      { prefix: keys.related(org, projectId) },
      { prefix: keys.activity(org, projectId) },
      { prefix: keys.messagePages(org), linksTo: [projectId] },
      { prefix: keys.notifications(org) },
      ...shared,
    ];
  return [
    { prefix: keys.project(org, projectId) },
    ...taskIds.flatMap((taskId) => [
      { prefix: keys.taskLocation(org, taskId) },
      { prefix: keys.taskAttachments(org, projectId, taskId) },
      { prefix: keys.activity(org, taskId) },
    ]),
    { prefix: keys.messagePages(org), linksTo: taskIds },
    { prefix: keys.notificationGroups(org, "all") },
    { prefix: keys.notificationGroups(org, "unread") },
    { prefix: keys.notificationEvents(org) },
    ...shared,
  ];
}

// targets.ts referencedWorkTargets: messages that reference one project's work changed.
function referencedWorkTargets(org: string, { projectId, taskIds }: ChangeDetail): HintTarget[] {
  if (!projectId || !taskIds)
    return [{ prefix: keys.related(org) }, { prefix: keys.activity(org) }, ...searchTargets(org)];
  return [
    { prefix: keys.related(org, projectId) },
    ...taskIds.flatMap((taskId) => [
      { prefix: keys.related(org, taskId) },
      { prefix: keys.activity(org, taskId) },
    ]),
    ...searchTargets(org),
  ];
}

// targets.ts messagePagesTarget: a changed message's context shows only in pages that include it.
function messagePagesTarget(
  org: string,
  conversationId: string | undefined,
  messageId: string | undefined,
): HintTarget {
  const target: HintTarget = { prefix: keys.messagePages(org, conversationId) };
  if (conversationId && messageId) target.withMessage = messageId;
  return target;
}

/** Mirrors domainTargets in apps/web/src/queries/targets.ts. */
function domainTargets(
  domain: "messaging" | "tasks" | "context" | "notifications",
  org: string,
  conversationId?: string,
  scope?: Scope,
  detail: ChangeDetail = {},
): HintTarget[] {
  switch (domain) {
    case "messaging":
      if (scope === "read") return [{ prefix: keys.messageUnread(org) }];
      if (scope === "reactions" && conversationId)
        return reactionTargets(org, conversationId, detail);
      return [
        { prefix: keys.messageUnread(org) },
        ...(scope !== "messages" ? [{ prefix: keys.conversations(org) }] : []),
        ...historyTargets(org, conversationId, scope, detail),
        ...(scope !== "messages"
          ? [
              {
                prefix:
                  conversationId && detail.messageId
                    ? reactionsOf(org, conversationId, detail.messageId)
                    : keys.conversationReactions(org, conversationId),
              },
            ]
          : []),
        conversationId && (scope === "messages" || detail.messageId)
          ? { prefix: keys.related(org), inConversation: conversationId }
          : { prefix: keys.related(org) },
        ...(scope !== "messages"
          ? [messagePagesTarget(org, conversationId, detail.messageId)]
          : []),
        { prefix: keys.messageTargets(org, conversationId) },
        ...searchTargets(org).map((target) =>
          scope === "messages" ? target : { prefix: target.prefix },
        ),
      ];
    case "tasks":
      if (detail.projectId) return workTargets(org, detail.projectId, detail.taskIds);
      return [
        { prefix: keys.tasks(org) },
        { prefix: keys.activity(org) },
        { prefix: keys.related(org) },
        { prefix: keys.messagePages(org), withLinks: true },
        { prefix: keys.notifications(org) },
        ...searchTargets(org),
      ];
    case "context":
      if (conversationId && detail.messageId)
        return [
          messagePagesTarget(org, conversationId, detail.messageId),
          { prefix: keys.messageTargets(org, conversationId) },
          ...searchTargets(org),
        ];
      if (detail.projectId) return referencedWorkTargets(org, detail);
      return [
        { prefix: keys.activity(org) },
        { prefix: keys.related(org) },
        { prefix: keys.messagePages(org) },
        { prefix: keys.messageTargets(org) },
        ...searchTargets(org),
      ];
    case "notifications":
      return [{ prefix: keys.notifications(org) }];
  }
}

/**
 * Mirrors realtimeQueryTargets in apps/web/src/queries/realtime/cache.ts. Returns null for an
 * access change, which resets private data instead.
 */
export function hintTargets(event: ChangeEvent, userId: string): HintTarget[] | null {
  const org = event.organizationId;
  switch (event.domain) {
    case "session":
      return [{ prefix: keys.session }];
    case "profile":
      return [
        { prefix: keys.session },
        ...(org
          ? [
              { prefix: keys.messaging(org) },
              { prefix: keys.context(org) },
              { prefix: keys.tasks(org) },
            ]
          : []),
      ];
    case "agents":
      return [{ prefix: keys.agents(userId) }];
    case "agent-work":
      return [{ prefix: keys.agentWork(userId, org ?? undefined) }];
    case "organization":
      // The detail prefix also covers the summary and people.
      return [
        { prefix: keys.organizations },
        { prefix: keys.userInvitations },
        ...(org
          ? [
              { prefix: keys.organizationDetail(org) },
              { prefix: keys.organizationInvitations(org) },
            ]
          : []),
      ];
    case "access":
      return null;
    case "messaging":
      if (!org) return [];
      return [
        // A published reply can answer a call without changing the invocation itself.
        ...(event.scope !== "read" && event.scope !== "reactions"
          ? [{ prefix: keys.myAgentCalls(userId, org, event.conversationId) }]
          : []),
        ...domainTargets("messaging", org, event.conversationId, event.scope, event),
      ];
    case "tasks":
    case "context":
    case "notifications":
      return org ? domainTargets(event.domain, org, event.conversationId, event.scope, event) : [];
    default:
      return [];
  }
}
