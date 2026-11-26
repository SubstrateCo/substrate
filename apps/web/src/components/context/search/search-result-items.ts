import {
  interactionLink,
  messageLink,
  personLink,
  recordLink,
  workLink,
  type RecordLink,
} from "@/lib/navigation/record-links";

type SearchHit = {
  id: string;
  kind: string;
  conversationId?: string | null;
  projectEntityId?: string | null;
  contactEntityId?: string | null;
};

/** The search hits that the enabled apps can open, each with the link that opens it. */
export function searchResultItems<T extends SearchHit>(
  hits: T[],
  organizationId: string,
  apps: { tasks: boolean; crm: boolean },
): (T & { link: RecordLink })[] {
  return hits.flatMap((item) => {
    const shown =
      ((item.kind !== "task" && item.kind !== "project") || apps.tasks) &&
      ((item.kind !== "account" && item.kind !== "deal") || apps.crm);
    return shown ? [{ ...item, link: searchResultLink(item, organizationId, apps.crm) }] : [];
  });
}

function searchResultLink(item: SearchHit, organizationId: string, crm: boolean): RecordLink {
  if (item.kind === "contact") return personLink(organizationId, item.id, crm);
  if (item.kind === "account" || item.kind === "deal")
    return recordLink(organizationId, item.kind === "account" ? "accounts" : "deals", item.id);
  if (item.kind === "contact_interaction")
    return item.contactEntityId
      ? personLink(organizationId, item.contactEntityId, crm)
      : interactionLink(organizationId, item.id);
  return item.conversationId
    ? messageLink(
        organizationId,
        item.conversationId,
        item.kind === "message" ? item.id : undefined,
      )
    : workLink(organizationId, item.projectEntityId!, item.kind === "task" ? item.id : undefined);
}
