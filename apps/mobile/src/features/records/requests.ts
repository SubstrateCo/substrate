import type { ContactWrite } from "@substrate/contracts/contacts/input";
import type {
  InteractionDirectory,
  InteractionPeriod,
  InteractionTimeline,
  InteractionWrite,
} from "@substrate/contracts/context/interactions";
import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";
import type { crmReport } from "@substrate/contracts/crm/input";
import type {
  CrmTimelineMode,
  CrmWrite,
  DealOutcome,
  RecordArchiveFilter,
} from "@substrate/contracts/crm/input";
import type { CrmLink } from "@substrate/contracts/crm/links";
import type { crmReportDeals } from "@substrate/contracts/crm/report-input";
import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { api } from "@/api/client";
import { readResult } from "@/api/result";
import { z } from "zod";

type Init = { signal?: AbortSignal };
type Workspace = { organizationId: string };
type Entity = Workspace & { entityId: string };
type ListInput = Workspace & {
  search?: string;
  archived?: RecordArchiveFilter;
  afterEntityId?: string;
};
const init = ({ signal }: Init) => ({ init: { signal } });

export const recordRequests = {
  crmReport: (data: z.input<typeof crmReport>, options: Init = {}) =>
    readResult(
      api.crm.report.$get(
        { query: { ...data, staleDays: data.staleDays?.toString() } },
        init(options),
      ),
    ),
  crmReportDeals: (data: z.input<typeof crmReportDeals>, options: Init = {}) =>
    readResult(
      api.crm["report-deals"].$get(
        {
          query: {
            ...data,
            staleDays: data.staleDays?.toString(),
            limit: data.limit?.toString(),
          },
        },
        init(options),
      ),
    ),
  recordLinks: (data: Entity, options: Init = {}) =>
    readResult(api.crm.links.$get({ query: data }, init(options))),
  addRecordLink: (data: CrmLink) => readResult(api.crm.links.$post({ json: data })),
  removeRecordLink: (data: CrmLink) => readResult(api.crm.links.$delete({ json: data })),
  linkTargets: (data: Workspace & { query: string }, options: Init = {}) =>
    readResult(
      api.context.search.$post(
        {
          json: {
            ...data,
            kinds: ["task", "project", "contact", "account", "deal", "contact_interaction"],
            limit: 30,
          },
        },
        init(options),
      ),
    ),
  apps: (data: Workspace, options: Init = {}) =>
    readResult(api.organizations.apps.$get({ query: data }, init(options))),

  projects: (data: Workspace & { archived?: RecordArchiveFilter }, options: Init = {}) =>
    readResult(api.tasks.projects.$get({ query: data }, init(options))),
  project: (data: Workspace & { projectEntityId: string }, options: Init = {}) =>
    readResult(api.tasks.project.$get({ query: data }, init(options))),
  taskLocation: (data: Workspace & { taskEntityId: string }, options: Init = {}) =>
    readResult(api.tasks["task-location"].$get({ query: data }, init(options))),
  mutateTasks: (data: TasksWrite) => readResult(api.tasks.mutations.$post({ json: data })),

  contacts: (data: ListInput, options: Init = {}) =>
    readResult(api.contacts.$get({ query: { ...data, limit: "100" } }, init(options))),
  contact: (data: Entity, options: Init = {}) =>
    readResult(api.contacts.record.$get({ query: data }, init(options))),
  mutateContact: (data: ContactWrite) => readResult(api.contacts.mutations.$post({ json: data })),

  accounts: (data: ListInput, options: Init = {}) =>
    readResult(api.crm.accounts.$get({ query: { ...data, limit: "100" } }, init(options))),
  account: (data: Entity, options: Init = {}) =>
    readResult(api.crm.account.$get({ query: data }, init(options))),
  deals: (data: ListInput & { outcome?: DealOutcome }, options: Init = {}) =>
    readResult(api.crm.deals.$get({ query: { ...data, limit: "100" } }, init(options))),
  deal: (data: Entity, options: Init = {}) =>
    readResult(api.crm.deal.$get({ query: data }, init(options))),
  pipeline: (data: Workspace, options: Init = {}) =>
    readResult(api.crm.pipeline.$get({ query: data }, init(options))),
  crmSettings: (data: Workspace, options: Init = {}) =>
    readResult(api.crm.settings.$get({ query: data }, init(options))),
  crmTimeline: (
    data: Entity & {
      mode: CrmTimelineMode;
      beforeOccurredAt?: string;
      beforeEntityId?: string;
    },
    options: Init = {},
  ) => readResult(api.crm.timeline.$get({ query: { ...data, limit: "50" } }, init(options))),
  followUps: (data: Entity, options: Init = {}) =>
    readResult(api.crm["follow-ups"].$get({ query: data }, init(options))),
  crmActivity: (
    data: Entity & { before?: { createdAt: string; id: string } | null },
    options: Init = {},
  ) =>
    readResult(
      api.crm.activity.$get(
        {
          query: {
            organizationId: data.organizationId,
            entityId: data.entityId,
            limit: "20",
            beforeCreatedAt: data.before?.createdAt,
            beforeId: data.before?.id,
          },
        },
        init(options),
      ),
    ),
  mutateCrm: (data: CrmWrite) => readResult(api.crm.mutations.$post({ json: data })),

  contactInteractions: (data: Workspace & { contactEntityId: string }, options: Init = {}) =>
    readResult(api.context.interactions.$get({ query: data }, init(options))),
  interactionTimeline: (data: InteractionTimeline, options: Init = {}) =>
    readResult(api.context.interactions.timeline.$get({ query: data }, init(options))),
  interactionDirectory: (data: InteractionDirectory, options: Init = {}) =>
    readResult(
      api.context.interactions.directory.$get(
        {
          query: { ...data, offset: data.offset?.toString(), pageSize: data.pageSize?.toString() },
        },
        init(options),
      ),
    ),
  interactionActivity: (data: InteractionPeriod, options: Init = {}) =>
    readResult(api.context.interactions.activity.$get({ query: data }, init(options))),
  interactionSources: (
    organizationId: string,
    interactionEntityIds: string[],
    options: Init = {},
  ) =>
    readResult(
      api.calendar["interaction-sources"].$post(
        {
          json: { organizationId, interactionEntityIds },
        },
        init(options),
      ),
    ),
  interaction: (data: Entity, options: Init = {}) =>
    readResult(api.context.interactions.record.$get({ query: data }, init(options))),
  mutateInteraction: (data: InteractionWrite) =>
    readResult(api.context.interactions.mutations.$post({ json: data })),

  organizationPeople: (data: Workspace, options: Init = {}) =>
    readResult(api.organizations.people.$get({ query: data }, init(options))),
  crmPeople: (data: Workspace, options: Init = {}) =>
    readResult(api.crm.people.$get({ query: data }, init(options))),
  crmGrants: (data: Entity, options: Init = {}) =>
    readResult(api.crm.grants.$get({ query: data }, init(options))),
  relatedMessages: (data: Entity, options: Init = {}) =>
    readResult(api.context.related.$get({ query: data }, init(options))),
  crmFromMessage: (data: CrmFromMessageInput) =>
    readResult(api.crm["from-message"].$post({ json: data })),
};

const createdRecord = z.object({ entityId: z.uuid() });
type Create<T, A> = Omit<Extract<T, { action: A }>, "action" | "organizationId">;

export const createRecord = {
  contact: async (organizationId: string, data: Create<ContactWrite, "createContact">) =>
    createdRecord.parse(
      await recordRequests.mutateContact({ ...data, organizationId, action: "createContact" }),
    ).entityId,
  account: async (organizationId: string, data: Create<CrmWrite, "createAccount">) =>
    createdRecord.parse(
      await recordRequests.mutateCrm({ ...data, organizationId, action: "createAccount" }),
    ).entityId,
  deal: async (organizationId: string, data: Create<CrmWrite, "createDeal">) =>
    createdRecord.parse(
      await recordRequests.mutateCrm({ ...data, organizationId, action: "createDeal" }),
    ).entityId,
  interaction: async (
    organizationId: string,
    data: Create<InteractionWrite, "createInteraction">,
  ) =>
    createdRecord.parse(
      await recordRequests.mutateInteraction({
        ...data,
        organizationId,
        action: "createInteraction",
      }),
    ).entityId,
};

export type ProjectSummary = Awaited<ReturnType<typeof recordRequests.projects>>[number];
export type ProjectDetail = Awaited<ReturnType<typeof recordRequests.project>>;
export type ProjectTask = ProjectDetail["tasks"][number];
export type ProjectActor = ProjectDetail["actors"][number];
export type ContactDetail = Awaited<ReturnType<typeof recordRequests.contact>>;
export type DealListItem = Awaited<ReturnType<typeof recordRequests.deals>>[number];
export type DealDetail = Awaited<ReturnType<typeof recordRequests.deal>>;
export type Stage = Awaited<ReturnType<typeof recordRequests.pipeline>>[number];
