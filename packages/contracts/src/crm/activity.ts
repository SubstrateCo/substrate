import { organizationId } from "../workspace.js";
import { z } from "zod";

export const crmActivityActions = [
  "created",
  "updated",
  "stage_changed",
  "owner_changed",
  "discussion_linked",
  "discussion_unlinked",
  "context_linked",
  "context_unlinked",
  "interaction_created",
  "interaction_updated",
  "interaction_deleted",
  "follow_up_created",
  "shared",
  "unshared",
  "archived",
  "restored",
] as const;

// An allowlist prevents a caller from storing values or private endpoint IDs as field names.
export const crmActivityFields = [
  "name",
  "website",
  "domain",
  "summary",
  "displayName",
  "givenName",
  "familyName",
  "notes",
  "middleName",
  "namePrefix",
  "nameSuffix",
  "nickname",
  "title",
  "account",
  "contacts",
  "primaryContact",
  "stage",
  "amount",
  "currency",
  "expectedCloseDate",
  "outcome",
  "lostReason",
  "owner",
  "identifier",
  "address",
  "url",
  "affiliation",
  "role",
  "kind",
  "occurredAt",
  "endedAt",
  "sharing",
] as const;

export const crmActivityInput = z.strictObject({
  entityId: z.uuid(),
  action: z.enum(crmActivityActions),
  changedFields: z.array(z.enum(crmActivityFields)).max(crmActivityFields.length).optional(),
  relatedEntityId: z.uuid().optional(),
});
export const crmActivityCursor = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
export const crmActivityOptions = z.strictObject({
  limit: z.number().int().min(1).max(100).optional(),
  before: crmActivityCursor.optional(),
});
export const crmActivityList = z
  .object({
    organizationId,
    entityId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    beforeCreatedAt: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.beforeCreatedAt) === Boolean(v.beforeId),
    "Supply both activity cursor fields.",
  );

export type CrmActivityInput = z.infer<typeof crmActivityInput>;
export type CrmActivityOptions = z.infer<typeof crmActivityOptions>;
export type CrmActivityCursor = z.infer<typeof crmActivityCursor>;
export type CrmActivity = {
  id: string;
  entityId: string;
  action: (typeof crmActivityActions)[number];
  changedFields: (typeof crmActivityFields)[number][];
  createdAt: string;
  actor: { type: "human" | "agent"; displayName: string };
  relatedEntityId?: string;
};
export type CrmActivityPage = { items: CrmActivity[]; nextCursor: CrmActivityCursor | null };
