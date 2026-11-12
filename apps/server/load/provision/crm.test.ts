import { crmWrite } from "@substrate/contracts/crm/input";
import { tasksWrite } from "@substrate/contracts/tasks/input";

import type { Account } from "./client";
import { crm } from "./crm";
import { request } from "@playwright/test";
import { expect, test } from "bun:test";

test("CRM provisioning resumes per-user fixtures without duplicate customers, deals or projects", async () => {
  const organizationId = crypto.randomUUID();
  const stageId = crypto.randomUUID();
  const writes: ReturnType<typeof crmWrite.parse>[] = [];
  const projects: { entityId: string; name: string }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET") expect(url.searchParams.get("organizationId")).toBe(organizationId);
      let data;
      if (req.method === "POST") {
        const body: unknown = await req.json();
        if (url.pathname === "/api/v1/tasks/mutations") {
          const command = tasksWrite.parse(body);
          expect(command.organizationId).toBe(organizationId);
          if (command.action !== "createProject")
            return new Response("unexpected task action", { status: 400 });
          const project = { entityId: crypto.randomUUID(), name: command.name };
          projects.push(project);
          data = { id: project.entityId };
        } else {
          const command = crmWrite.parse(body);
          expect(command.organizationId).toBe(organizationId);
          writes.push(command);
          data = {
            entityId:
              command.action === "setAffiliation" ? command.contactEntityId : crypto.randomUUID(),
          };
          if (command.action === "createAccount") accounts.push({ ...data, name: command.name });
          if (command.action === "createContact")
            contacts.push({ ...data, displayName: command.displayName });
          if (command.action === "createDeal") deals.push({ ...data, title: command.title });
        }
      } else {
        const search = url.searchParams.get("search");
        switch (url.pathname) {
          case "/api/v1/crm/accounts":
            data = accounts.filter((row) => row.name === search);
            break;
          case "/api/v1/crm/contacts":
            data = contacts.flatMap((contact) =>
              contact.displayName === search ? [{ contact, archivedAt: null }] : [],
            );
            break;
          case "/api/v1/crm/deals":
            data = deals.filter((row) => row.title === search);
            break;
          case "/api/v1/crm/pipeline":
            data = [{ id: stageId }];
            break;
          case "/api/v1/tasks/projects":
            data = projects;
            break;
          default:
            return new Response("unexpected route", { status: 404 });
        }
      }
      return Response.json({ success: true, data });
    },
  });
  const accounts: { entityId: string; name: string }[] = [];
  const contacts: { entityId: string; displayName: string }[] = [];
  const deals: { entityId: string; title: string }[] = [];
  const clients = await Promise.all(
    [1, 2].map(() => request.newContext({ baseURL: server.url.href })),
  );
  const members: Account[] = clients.map((client, index) => ({
    client,
    organizationId,
    userId: crypto.randomUUID(),
    email: `load-${index}@load.test`,
    name: `Load ${index}`,
  }));
  try {
    await crm(members);
    const fixtures = members.map((row) => row.crm);
    await crm(members);
    expect(members.map((row) => row.crm)).toEqual(fixtures);
    expect(accounts).toHaveLength(2);
    expect(contacts).toHaveLength(2);
    expect(deals).toHaveLength(2);
    expect(projects).toHaveLength(2);
    for (const member of members) {
      const customer = member.crm!;
      const deal = writes.find(
        (row) => row.action === "createDeal" && row.accountEntityId === customer.accountEntityId,
      );
      expect(deal).toMatchObject({
        contactEntityIds: [customer.contactEntityId],
        primaryContactEntityId: customer.contactEntityId,
        stageId,
      });
      expect(projects.find((row) => row.entityId === customer.projectEntityId)?.name).toBe(
        `Load CRM ${member.email}`,
      );
    }
    expect(writes.filter((row) => row.action === "createAccount")).toHaveLength(2);
    expect(writes.filter((row) => row.action === "createDeal")).toHaveLength(2);
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
    await server.stop(true);
  }
});
