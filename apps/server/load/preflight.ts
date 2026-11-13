import type { AppType } from "../src/app";
import type { createAuth } from "../src/auth/server";
import { api, config, json, parallel } from "./provision/client";
import {
  DISCUSSION_MESSAGES_PER_USER,
  FOLLOW_UPS_PER_USER,
  provisioningTarget,
} from "./provision/fixture";
import { validateFixture } from "./provision/validate";
import type { LoadFixture } from "./types";
import { request } from "@playwright/test";
import type { hc, InferResponseType } from "hono/client";
import { fileURLToPath } from "node:url";

type Client = ReturnType<typeof hc<AppType>>["api"]["v1"];
type Data<T> = Extract<InferResponseType<T>, { success: true }>["data"];
export type PreflightData = {
  "crm/account": Data<Client["crm"]["account"]["$get"]>;
  "contacts/record": Data<Client["contacts"]["record"]["$get"]>;
  "crm/deal": Data<Client["crm"]["deal"]["$get"]>;
  "tasks/project": Data<Client["tasks"]["project"]["$get"]>;
  "messaging/conversations": Data<Client["messaging"]["conversations"]["$get"]>;
  "messaging/messages": Data<Client["messaging"]["messages"]["$get"]>;
  "crm/follow-ups": Data<Client["crm"]["follow-ups"]["$get"]>;
  "crm/report": Data<Client["crm"]["report"]["$get"]>;
  "context/notifications/groups": Data<Client["context"]["notifications"]["groups"]["$get"]>;
  "context/notifications/events": Data<Client["context"]["notifications"]["events"]["$get"]>;
};
type AuthApi = ReturnType<typeof createAuth>["api"];

export interface PreflightOptions {
  fixturePath?: string;
  apiUrl?: string;
  origin?: string;
}

/** Authenticate every fixture identity and read every required resource as that user. */
export async function preflight(options: PreflightOptions = {}): Promise<LoadFixture> {
  const target = {
    apiUrl: options.apiUrl ?? config.apiUrl,
    origin: options.origin ?? config.origin,
  };
  const fixture = validateFixture(
    await Bun.file(
      options.fixturePath ?? fileURLToPath(new URL("./.data/users.json", import.meta.url)),
    ).json(),
    target,
  );
  await parallel(fixture.users, async (user) => {
    const client = await request.newContext({
      baseURL: target.apiUrl,
      extraHTTPHeaders: { Origin: target.origin },
      timeout: 30_000,
      maxRedirects: 0,
    });
    try {
      const signedIn = await json<Awaited<ReturnType<AuthApi["signInEmail"]>>>(
        await client.post("/api/auth/sign-in/email", {
          data: { email: user.email, password: fixture.password },
        }),
      );
      if (signedIn.user.id !== user.userId || !signedIn.user.emailVerified)
        throw new Error("Fixture identity mismatch or unverified account");
      const memberships = await json<Awaited<ReturnType<AuthApi["listOrganizations"]>>>(
        await client.get("/api/auth/organization/list"),
      );
      if (memberships.length !== 1 || memberships[0]?.id !== user.organizationId)
        throw new Error("Fixture organization membership mismatch");
      await json<Awaited<ReturnType<AuthApi["setActiveOrganization"]>>>(
        await client.post("/api/auth/organization/set-active", {
          data: { organizationId: user.organizationId },
        }),
      );
      const session = await json<Awaited<ReturnType<AuthApi["getSession"]>>>(
        await client.get("/api/auth/get-session"),
      );
      if (
        session?.user.id !== user.userId ||
        session.session.activeOrganizationId !== user.organizationId
      )
        throw new Error("Fixture active session mismatch");
      const customer = user.crm!;
      const workspace = user.workspace!;
      const query = `?organizationId=${encodeURIComponent(user.organizationId)}`;
      const read = <Path extends keyof PreflightData>(path: Path, extra = "") =>
        api<PreflightData[Path]>(client, `/api/v1/${path}${query}${extra}`);
      const [account, contact, deal, project, channel, discussion, messages, followUps] =
        await Promise.all([
          read("crm/account", `&entityId=${customer.accountEntityId}`),
          read("contacts/record", `&entityId=${customer.contactEntityId}`),
          read("crm/deal", `&entityId=${customer.dealEntityId}`),
          read("tasks/project", `&projectEntityId=${workspace.projectEntityId}`),
          read("messaging/conversations", `&conversationId=${workspace.conversationId}`),
          read("messaging/conversations", `&conversationId=${workspace.discussionId}`),
          read("messaging/messages", `&conversationId=${workspace.discussionId}`),
          read("crm/follow-ups", `&entityId=${customer.dealEntityId}`),
        ]);
      const dealMatches =
        deal.deal.entityId === customer.dealEntityId &&
        deal.deal.accountEntityId === customer.accountEntityId &&
        deal.contacts.some(
          (row) => row.contact.entityId === customer.contactEntityId && row.isPrimary,
        );
      const affiliationsMatch =
        contact.affiliations.some(
          (row) => row.account.entityId === customer.accountEntityId && row.affiliation.isPrimary,
        ) &&
        account.contacts.some(
          (row) => row.contact.entityId === customer.contactEntityId && row.affiliation.isPrimary,
        );
      const identitiesMatch =
        account.account.entityId === customer.accountEntityId &&
        contact.profile.entityId === customer.contactEntityId;
      if (!identitiesMatch || !affiliationsMatch || !dealMatches)
        throw new Error("Missing or mismatched CRM fixture");
      if (![account, contact, deal, project].every((row) => ["edit", "owner"].includes(row.level)))
        throw new Error("Required fixture resources are not editable");
      if (project.project.entityId !== workspace.projectEntityId)
        throw new Error("Fixture project identity mismatch");
      if (
        project.tasks.length < FOLLOW_UPS_PER_USER ||
        !project.tasks.some((row) => row.entityId === workspace.taskEntityId) ||
        !followUps.tasks.some((row) => row.entityId === workspace.taskEntityId)
      )
        throw new Error("Missing accessible task or structured CRM follow-up");
      if (
        !channel.some((row) => row.id === workspace.conversationId && row.joined && row.canPost) ||
        !discussion.some(
          (row) =>
            row.id === workspace.discussionId &&
            row.canPost &&
            row.task?.taskEntityId === workspace.taskEntityId &&
            row.task.projectEntityId === workspace.projectEntityId,
        ) ||
        messages.length < DISCUSSION_MESSAGES_PER_USER
      )
        throw new Error("Missing accessible channel or populated task discussion");
      const history = await read(
        "messaging/messages",
        `&conversationId=${workspace.conversationId}`,
      );
      if (!history.length) throw new Error("Missing channel history");
      const notification = user.notification!;
      const [groups, events, source] = await Promise.all([
        read("context/notifications/groups", "&filter=all&limit=20"),
        read(
          "context/notifications/events",
          `&groupKey=${encodeURIComponent(`thread:${notification.messageId}`)}&limit=20`,
        ),
        read(
          "messaging/messages",
          `&conversationId=${notification.conversationId}&aroundMessageId=${notification.messageId}`,
        ),
      ]);
      const mention = events.items.some(
        (row) =>
          row.kind === "mention" &&
          row.messageId === notification.messageId &&
          row.conversationId === notification.conversationId,
      );
      const readableSource = source.some(
        (row) =>
          row.id === notification.messageId &&
          row.authorActorEntityId === notification.senderActorEntityId &&
          row.deletedAt === null &&
          row.body.includes(`@[person:${user.actorEntityId!}]`),
      );
      if (
        !groups.items.some((row) => row.groupKey === `thread:${notification.messageId}`) ||
        !mention ||
        !readableSource
      )
        throw new Error(
          "Missing notification group, recipient mention, or accessible source message",
        );
      const organization = fixture.organizations.find((row) => row.id === user.organizationId)!;
      if (organization.ownerEmail === user.email) {
        const now = Date.now();
        const period = new URLSearchParams({
          from: new Date(now - 30 * 86_400_000).toISOString(),
          to: new Date(now + 86_400_000).toISOString(),
        });
        const report = await read("crm/report", `&${period}`);
        if (!(report.won > 0 && report.lost > 0))
          throw new Error(
            "Missing won/lost fixtures in the current close report period. Reset and reseed.",
          );
      }
    } catch (error) {
      throw new Error(
        `Preflight failed for ${user.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await client.dispose();
    }
  });
  return fixture;
}

if (import.meta.main) {
  provisioningTarget(config);
  const fixture = await preflight();
  console.log(
    `Preflight passed: seed ${fixture.seed.version}/${fixture.seed.profile}, ${fixture.users.length} authenticated users in ${fixture.organizations.length} organizations. Counts are planned fixture minima, not a database audit.`,
  );
}
