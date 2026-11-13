import type { contactWrite } from "@substrate/contracts/contacts/input";
import type { crmWrite } from "@substrate/contracts/crm/input";

import { api, parallel, type Account } from "./client";
import type { z } from "zod";

type WithoutOrganization<T> = T extends unknown ? Omit<T, "organizationId"> : never;
type ProvisionCommand = WithoutOrganization<
  Extract<
    z.input<typeof crmWrite> | z.input<typeof contactWrite>,
    {
      action: "createAccount" | "createContact" | "createDeal" | "setAffiliation";
    }
  >
>;

/** Private customer records and a follow-up project for each fixed load user. */
export async function crm(members: Account[]) {
  await parallel(members, async (member) => {
    const organizationId = member.organizationId;
    const query = `?organizationId=${organizationId}`;
    const name = `Load CRM ${member.email}`;
    const read = <T>(path: string, search = "") =>
      api<T>(member.client, `/api/v1/${path}${query}${search}`);
    const write = <T>(input: ProvisionCommand) =>
      api<T>(
        member.client,
        input.action === "createContact" ? "/api/v1/contacts/mutations" : "/api/v1/crm/mutations",
        { organizationId, ...input },
      );
    const accounts = await read<{ entityId: string; name: string }[]>(
      "crm/accounts",
      `&search=${encodeURIComponent(name)}`,
    );
    const account =
      accounts.find((row) => row.name === name) ??
      (await write<{ entityId: string }>({
        action: "createAccount",
        name,
        requestId: crypto.randomUUID(),
      }));
    const contacts = await read<{ contact: { entityId: string; displayName: string } }[]>(
      "contacts",
      `&search=${encodeURIComponent(name)}`,
    );
    const contact =
      contacts.find((row) => row.contact.displayName === name)?.contact ??
      (await write<{ entityId: string }>({ action: "createContact", displayName: name }));
    await write({
      action: "setAffiliation",
      contactEntityId: contact.entityId,
      accountEntityId: account.entityId,
      title: "Customer lead",
      isPrimary: true,
    });
    const stages = await read<{ id: string }[]>("crm/pipeline");
    const deals = await read<{ entityId: string; title: string }[]>(
      "crm/deals",
      `&search=${encodeURIComponent(name)}`,
    );
    const deal =
      deals.find((row) => row.title === name) ??
      (await write<{ entityId: string }>({
        action: "createDeal",
        title: name,
        requestId: crypto.randomUUID(),
        accountEntityId: account.entityId,
        contactEntityIds: [contact.entityId],
        primaryContactEntityId: contact.entityId,
        stageId: stages[0]!.id,
        amount: "24000",
        currency: "USD",
      }));
    const projects = await read<{ entityId: string; name: string }[]>("tasks/projects");
    const projectEntityId =
      projects.find((row) => row.name === name)?.entityId ??
      (
        await api<{ id: string }>(member.client, "/api/v1/tasks/mutations", {
          organizationId,
          action: "createProject",
          name,
        })
      ).id;
    member.crm = {
      accountEntityId: account.entityId,
      contactEntityId: contact.entityId,
      dealEntityId: deal.entityId,
      projectEntityId,
    };
  });
}
