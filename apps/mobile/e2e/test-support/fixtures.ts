import type { contactWrite } from "@substrate/contracts/contacts/input";
import type { contextLink } from "@substrate/contracts/context/input";
import type { interactionWrite } from "@substrate/contracts/context/interactions";
import type { crmWrite } from "@substrate/contracts/crm/input";
import type { conversationInput, messageInput } from "@substrate/contracts/messaging/input";
import type { sharingAcceptInput } from "@substrate/contracts/messaging/sharing";
import type { tasksWrite } from "@substrate/contracts/tasks/input";

import { emailLink } from "./mailpit";
import { bundleFailure } from "./renderer-errors";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { z } from "zod";

export const previewURL = process.env.MOBILE_E2E_URL ?? "http://localhost:8081";
export const apiURL = process.env.MOBILE_E2E_API_URL ?? "http://localhost:3101";

type Result<T> = { success: true; data: T } | { success: false; error: { message: string } };
type FixtureMutation = z.input<
  | typeof contactWrite
  | typeof contextLink
  | typeof interactionWrite
  | typeof crmWrite
  | typeof conversationInput
  | typeof messageInput
  | typeof sharingAcceptInput
  | typeof tasksWrite
>;
type WorkspaceMutation<T = FixtureMutation> = T extends FixtureMutation
  ? Omit<T, "organizationId">
  : never;

export async function mutation<T>(
  request: APIRequestContext,
  path: string,
  data: FixtureMutation,
): Promise<T> {
  const response = await request.post(`/api/v1/${path}`, { data });
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBe(true);
  const result: Result<T> = await response.json();
  if (!result.success) throw new Error(`${path}: ${result.error.message}`);
  return result.data;
}

async function account(request: APIRequestContext, name: string, workspace = true) {
  const id = randomUUID();
  const email = `mobile-e2e-${id}@example.test`;
  const password = `Mobile-e2e-${id}!`;
  const signup = await request.post("/api/auth/sign-up/email", {
    data: { name, email, password, callbackURL: "/login" },
  });
  expect(signup.ok(), "Synthetic account signs up through Better Auth").toBe(true);

  const link = await emailLink(
    request,
    email,
    "Verify your Substrate email",
    "/api/auth/verify-email",
  );
  const verification = new URL(link);
  const verified = await request.get(`${verification.pathname}${verification.search}`, {
    maxRedirects: 0,
  });
  expect(verified.status()).toBeLessThan(400);
  expect(verified.status()).toBeGreaterThanOrEqual(200);
  const signedIn = await request.post("/api/auth/sign-in/email", { data: { email, password } });
  expect(signedIn.ok(), "Verified synthetic account signs in").toBe(true);
  if (!workspace) return { email, password, organizationId: "", name };
  const created = await request.post("/api/auth/organization/create", {
    data: { name: `${name}'s test workspace`, slug: `mobile-e2e-${id}` },
  });
  expect(created.ok()).toBe(true);
  const organization: { id: string } = await created.json();
  const activated = await request.post("/api/auth/organization/set-active", {
    data: { organizationId: organization.id },
  });
  expect(activated.ok()).toBe(true);
  const apps = await request.patch("/api/v1/organizations/apps", {
    data: { organizationId: organization.id, enabledApps: ["messages", "agents", "tasks", "crm"] },
  });
  expect(apps.ok()).toBe(true);
  return { email, password, organizationId: organization.id, name };
}

async function provision(
  request: APIRequestContext,
  partnerRequest: APIRequestContext,
  memberRequest: APIRequestContext,
) {
  const owner = await account(request, "Alex Morgan · synthetic");
  const partner = await account(partnerRequest, "Jordan Lee · synthetic partner");
  const organizationId = owner.organizationId;
  const member = await account(memberRequest, "Sam Taylor · synthetic teammate", false);
  const invited = await request.post("/api/auth/organization/invite-member", {
    data: { organizationId, email: member.email, role: "member" },
  });
  expect(invited.ok()).toBe(true);
  const invitationToWorkspace: { id: string } = await invited.json();
  const acceptedMember = await memberRequest.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: invitationToWorkspace.id },
  });
  expect(acceptedMember.ok()).toBe(true);
  const activeMember = await memberRequest.post("/api/auth/organization/set-active", {
    data: { organizationId },
  });
  expect(activeMember.ok()).toBe(true);
  member.organizationId = organizationId;
  const browsable = await mutation<{ id: string }>(memberRequest, "messaging/conversations", {
    organizationId,
    kind: "channel",
    name: "team-notes",
    private: false,
  });
  const write = <T>(path: string, data: WorkspaceMutation) =>
    mutation<T>(request, path, { ...data, organizationId });
  const project = await write<{ id: string }>("tasks/mutations", {
    action: "createProject",
    name: "Mobile launch · synthetic",
    description: "Synthetic review records in the dedicated E2E database.",
  });
  const task = await write<{ id: string }>("tasks/mutations", {
    action: "createTask",
    projectEntityId: project.id,
    title: "Review the mobile launch checklist",
    description: "Confirm the handoff with the design partner.",
    status: "in_progress",
    priority: "high",
  });
  const contact = await write<{ entityId: string }>("contacts/mutations", {
    action: "createContact",
    displayName: "Jordan Lee · test contact",
    notes: "Synthetic design partner. Not a real customer.",
  });
  await write("contacts/mutations", {
    action: "addIdentifier",
    contactEntityId: contact.entityId,
    type: "email",
    value: partner.email,
    isPrimary: true,
  });
  await write("context/interactions/mutations", {
    action: "createInteraction",
    contactEntityId: contact.entityId,
    kind: "meeting",
    occurredAt: new Date().toISOString(),
    summary: "Discussed launch scope and the next design review.",
  });
  const crmAccount = await write<{ entityId: string }>("crm/mutations", {
    action: "createAccount",
    name: "Northstar Studio · synthetic",
    summary: "Synthetic partner account for mobile review.",
    website: "https://example.test",
  });
  await write("crm/mutations", {
    action: "setAffiliation",
    contactEntityId: contact.entityId,
    accountEntityId: crmAccount.entityId,
    title: "Design partner",
    isPrimary: true,
  });
  const pipelineResponse = await request.get("/api/v1/crm/pipeline", {
    params: { organizationId },
  });
  expect(pipelineResponse.ok()).toBe(true);
  const pipeline: Result<{ id: string }[]> = await pipelineResponse.json();
  if (!pipeline.success) throw new Error(pipeline.error.message);
  const stage = pipeline.data.at(0);
  if (!stage) throw new Error("The real workspace has no initial CRM stage.");
  const deal = await write<{ entityId: string }>("crm/mutations", {
    action: "createDeal",
    title: "Mobile design partnership · synthetic",
    stageId: stage.id,
    accountEntityId: crmAccount.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    amount: "12000",
    currency: "USD",
    summary: "Synthetic opportunity for the connected mobile review.",
  });
  const channel = await write<{ id: string; name: string }>("messaging/conversations", {
    kind: "channel",
    name: "mobile-launch",
    private: true,
    emails: [partner.email],
    shareHistory: true,
  });
  const invitations = await partnerRequest.get("/api/v1/messaging/sharing/inbox", {
    params: { organizationId: partner.organizationId },
  });
  expect(invitations.ok()).toBe(true);
  const inbox: Result<{ conversationId: string; id: string }[]> = await invitations.json();
  if (!inbox.success) throw new Error(inbox.error.message);
  const invitation = inbox.data.find((item) => item.conversationId === channel.id);
  if (!invitation) throw new Error("The real partner collaboration invitation was not created.");
  await mutation(partnerRequest, "messaging/sharing/accept", {
    organizationId: partner.organizationId,
    invitationId: invitation.id,
    shareHistory: true,
  });
  const message = await write<{ id: string }>("messaging/messages", {
    conversationId: channel.id,
    body: "The mobile launch checklist is ready for review.",
  });
  await mutation(partnerRequest, "messaging/messages", {
    organizationId: partner.organizationId,
    conversationId: channel.id,
    body: "Thanks Alex. I will review the handoff today.",
    threadId: message.id,
  });
  await write("context/links", { messageId: message.id, entityId: task.id });
  await write("context/links", { messageId: message.id, entityId: contact.entityId });
  const pendingChannel = await mutation<{ id: string }>(partnerRequest, "messaging/conversations", {
    organizationId: partner.organizationId,
    kind: "channel",
    name: "partner-review",
    private: true,
    emails: [owner.email],
    shareHistory: true,
  });
  return {
    ...owner,
    request,
    partnerRequest,
    partner,
    member,
    browsableId: browsable.id,
    pendingChannelId: pendingChannel.id,
    projectId: project.id,
    taskId: task.id,
    contactId: contact.entityId,
    accountId: crmAccount.entityId,
    dealId: deal.entityId,
    conversationId: channel.id,
    conversationName: channel.name,
    messageId: message.id,
  };
}

export type ReviewWorkspace = Awaited<ReturnType<typeof provision>>;

export const test = base.extend<{
  workspace: ReviewWorkspace;
  backendGuard: void;
  rendererErrors: void;
}>({
  rendererErrors: [
    async ({ page }, use, info) => {
      const errors: string[] = [];
      const bundleErrors: Promise<void>[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (
          response.status() >= 400 &&
          url.origin === new URL(previewURL).origin &&
          url.pathname.endsWith(".bundle")
        )
          bundleErrors.push(
            bundleFailure(response, page.request).then((diagnostic) => {
              errors.push(diagnostic);
            }),
          );
      });
      await use();
      await Promise.all(bundleErrors);
      if (info.status !== info.expectedStatus && errors.length) {
        const path = info.outputPath("renderer-errors.txt");
        await writeFile(path, errors.join("\n\n"));
        await info.attach("Expo web preview · renderer errors", {
          path,
          contentType: "text/plain",
        });
      }
    },
    { auto: true },
  ],
  backendGuard: [
    async ({ context }, use) => {
      await context.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).origin !== new URL(apiURL).origin) {
          await route.abort("blockedbyclient");
          throw new Error(
            "Mobile preview tried to use a backend other than the dedicated E2E API.",
          );
        }
        await route.continue();
      });
      await use();
    },
    { auto: true },
  ],
  workspace: async ({ playwright }, use) => {
    const options = { baseURL: apiURL, extraHTTPHeaders: { origin: previewURL } };
    const request = await playwright.request.newContext(options);
    const partnerRequest = await playwright.request.newContext(options);
    const memberRequest = await playwright.request.newContext(options);
    try {
      const health = await request.get("/api/auth/ok");
      expect(health.ok(), "The dedicated real E2E API is running").toBe(true);
      await use(await provision(request, partnerRequest, memberRequest));
    } finally {
      await Promise.all([request.dispose(), partnerRequest.dispose(), memberRequest.dispose()]);
    }
  },
});
