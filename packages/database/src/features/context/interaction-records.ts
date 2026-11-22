import type { ContextEntityType } from "@substrate/contracts/context/input";

import { requireAppEnabled } from "../../core/apps/access";
import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import { contacts } from "../../core/contacts/schema";
import { linkRepository } from "../../core/links/repository";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { presentInteraction } from "../crm/actor-views";
import { crmAccounts, crmAffiliations, crmContactProfiles } from "../crm/schema";
import { requireContextTargetPage } from "./target-page";
import { and, eq } from "drizzle-orm";

export type InteractionConnection = {
  entityId: string;
  entityType: ContextEntityType;
  title: string;
  relation: string;
  projectEntityId: string | null;
  contactEntityId: string | null;
};

async function linkedRecords(
  context: RepositoryContext,
  entityId: string,
): Promise<InteractionConnection[]> {
  const links = await linkRepository(context).list(entityId, { limit: 100 });
  const ids = [
    ...new Set(
      links.map((row) =>
        row.sourceEntityId === entityId ? row.targetEntityId : row.sourceEntityId,
      ),
    ),
  ];
  const targets = await requireContextTargetPage(context, ids);
  return ids.map((id): InteractionConnection => {
    const target = targets.get(id)!;
    return {
      entityId: id,
      entityType: target.entityType,
      title: target.title,
      relation: "Related record",
      projectEntityId: target.projectEntityId,
      contactEntityId: target.contactEntityId,
    };
  });
}

export async function interactionRecordDetail(context: RepositoryContext, entityId: string) {
  const record = await contactInteractionRepository(context).get(entityId);
  const access = await context.requireAccess(entityId, "view");
  const [contact] = await context.db
    .select({ name: contacts.displayName })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, context.scope.organizationId),
        eq(contacts.entityId, record.contactEntityId),
        context.readable(contacts.entityId),
      ),
    );
  if (!contact) throw new AccessDeniedError();
  const [profile] = await context.db
    .select({ archivedAt: crmContactProfiles.archivedAt })
    .from(crmContactProfiles)
    .where(
      and(
        eq(crmContactProfiles.organizationId, context.scope.organizationId),
        eq(crmContactProfiles.contactEntityId, record.contactEntityId),
      ),
    );
  return {
    interaction: await presentInteraction(context, { ...record, contactName: contact.name }),
    level: access.level,
    archived: !!profile?.archivedAt,
    links: await linkedRecords(context, entityId),
  };
}

export async function interactionProfileDetail(
  context: RepositoryContext,
  entityId: string,
  type: "person" | "account",
) {
  if (type === "account") await requireAppEnabled(context, "crm", false);
  const access = await context.requireAccess(entityId, "view");
  if (access.entity.entityType !== (type === "person" ? "contact" : "account"))
    throw new AccessDeniedError();
  const table = type === "person" ? contacts : crmAccounts;
  const [profile] = await context.db
    .select({
      title: type === "person" ? contacts.displayName : crmAccounts.name,
      summary: type === "person" ? contacts.notes : crmAccounts.summary,
    })
    .from(table)
    .where(
      and(eq(table.organizationId, context.scope.organizationId), eq(table.entityId, entityId)),
    );
  if (!profile) throw new AccessDeniedError();
  const other = type === "person" ? crmAccounts : contacts;
  const connections = await context.db
    .select({
      entityId: other.entityId,
      title: type === "person" ? crmAccounts.name : contacts.displayName,
    })
    .from(crmAffiliations)
    .innerJoin(
      other,
      and(
        eq(other.organizationId, crmAffiliations.organizationId),
        eq(
          other.entityId,
          type === "person" ? crmAffiliations.accountEntityId : crmAffiliations.contactEntityId,
        ),
      ),
    )
    .where(
      and(
        eq(crmAffiliations.organizationId, context.scope.organizationId),
        eq(
          type === "person" ? crmAffiliations.contactEntityId : crmAffiliations.accountEntityId,
          entityId,
        ),
        context.readable(other.entityId),
      ),
    )
    .orderBy(other.entityId)
    .limit(100);
  const affiliations: InteractionConnection[] = connections.map((row) => ({
    ...row,
    entityType: type === "person" ? "account" : "contact",
    relation: "Affiliation",
    projectEntityId: null,
    contactEntityId: null,
  }));
  const linked = await linkedRecords(context, entityId);
  return {
    ...profile,
    entityId,
    type,
    level: access.level,
    connections: [
      ...affiliations,
      ...linked.filter((link) => !affiliations.some((row) => row.entityId === link.entityId)),
    ],
  };
}
