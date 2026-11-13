import { preflight, type PreflightData } from "./preflight";
import { sampleFixture } from "./provision/fixture.test";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

test("preflight authenticates all users and rejects inaccessible or missing required data", async () => {
  let failure = "";
  const authenticated = new Set<string>();
  let reports = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/api/auth/sign-in/email") {
        const { email } = z.object({ email: z.email() }).parse(await req.json());
        const user = fixture.users.find((row) => row.email === email)!;
        authenticated.add(email);
        return Response.json(
          { user: { id: user.userId, emailVerified: failure !== "unverified" } },
          { headers: { "Set-Cookie": `identity=${user.userId}; Path=/` } },
        );
      }
      const user = fixture.users.find((row) =>
        req.headers.get("cookie")?.split("; ").includes(`identity=${row.userId}`),
      );
      if (!user) return new Response("not authenticated", { status: 401 });
      const customer = user.crm!;
      const workspace = user.workspace!;
      const notification = user.notification!;
      if (url.pathname === "/api/v1/context/notifications/groups")
        expect(url.searchParams.get("filter")).toBe("all");
      if (url.pathname === "/api/v1/crm/report") {
        reports++;
        expect(Date.parse(url.searchParams.get("from")!)).toBeLessThan(Date.now());
        expect(Date.parse(url.searchParams.get("to")!)).toBeGreaterThan(Date.now());
      }
      if (failure === "denied" && url.pathname === "/api/v1/crm/account")
        return new Response("denied", { status: 403 });
      if (failure === "service-error" && url.pathname === "/api/v1/contacts/record")
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Contact not accessible" },
        });
      if (url.pathname === "/api/auth/organization/list")
        return Response.json([
          { id: failure === "wrong-membership" ? "wrong" : user.organizationId },
        ]);
      if (url.pathname === "/api/auth/organization/set-active")
        return Response.json({ id: user.organizationId });
      if (url.pathname === "/api/auth/get-session")
        return Response.json({
          user: { id: user.userId },
          session: {
            activeOrganizationId: failure === "wrong-session" ? "wrong" : user.organizationId,
          },
        });
      const at = "2026-11-13T00:00:00.000Z";
      const tasks: PreflightData["tasks/project"]["tasks"] = Array.from({ length: 4 }, (_, i) => ({
        entityId: i === 0 ? workspace.taskEntityId : `task-${i}`,
        projectEntityId: workspace.projectEntityId,
        parentTaskEntityId: null,
        title: "Follow up",
        description: "",
        status: "not_started",
        priority: "medium",
        assigneeActorEntityId: user.actorEntityId!,
        dueDate: "2026-11-13",
        discussionConversationId: workspace.discussionId,
      }));
      const level = failure === "read-only" ? "view" : "owner";
      const isDiscussion = url.searchParams.get("conversationId") === workspace.discussionId;
      const account: PreflightData["crm/account"]["account"] = {
        entityId: customer.accountEntityId,
        organizationId: user.organizationId,
        entityType: "account",
        name: "Customer",
        website: null,
        domain: null,
        summary: "",
        ownerActorEntityId: user.actorEntityId!,
        archivedAt: null,
      };
      const profile: PreflightData["contacts/record"]["profile"] = {
        entityId: failure === "wrong-contact" ? "wrong" : customer.contactEntityId,
        organizationId: user.organizationId,
        entityType: "contact",
        displayName: "Customer lead",
        givenName: null,
        middleName: null,
        familyName: null,
        namePrefix: null,
        nameSuffix: null,
        nickname: null,
        notes: null,
      };
      const affiliation: PreflightData["contacts/record"]["affiliations"][number]["affiliation"] = {
        id: "affiliation",
        organizationId: user.organizationId,
        contactEntityId: customer.contactEntityId,
        accountEntityId: customer.accountEntityId,
        title: "Customer lead",
        isPrimary: true,
      };
      const message: PreflightData["messaging/messages"][number] = {
        id: notification.messageId,
        conversationId: notification.conversationId,
        authorActorEntityId:
          failure === "wrong-sender" ? "wrong" : notification.senderActorEntityId,
        authorOrganizationId: user.organizationId,
        body: failure === "wrong-recipient" ? "review" : `@[person:${user.actorEntityId!}] review`,
        deletedAt: failure === "deleted-source" ? at : null,
        createdAt: at,
        editedAt: null,
        requestId: null,
        threadId: null,
        isRoot: true,
        threadRoot: true,
        originTurnId: null,
        canModify: false,
        attachments: [],
        authorName: "Sender",
        authorImage: null,
        authorType: "human",
        authorExternal: false,
        replyCount: 0,
        reactions: [],
      };
      const messagePage = url.searchParams.has("aroundMessageId")
        ? [message]
        : Array.from({ length: 6 }, (_, i) => ({
            ...message,
            id: String(i),
            conversationId: url.searchParams.get("conversationId")!,
          }));
      if (url.pathname === "/api/v1/context/notifications/events")
        expect(url.searchParams.get("groupKey")).toBe(`thread:${notification.messageId}`);
      if (url.searchParams.has("aroundMessageId")) {
        expect(url.searchParams.get("aroundMessageId")).toBe(notification.messageId);
        expect(url.searchParams.get("conversationId")).toBe(notification.conversationId);
      }
      const event: PreflightData["context/notifications/events"]["items"][number] = {
        id: "notification",
        kind: "mention",
        messageId: notification.messageId,
        conversationId:
          failure === "wrong-event-conversation" ? "wrong" : notification.conversationId,
        readAt: at,
        createdAt: at,
        actorName: "Sender",
        actorImage: null,
        title: "You were mentioned",
        entityId: null,
        projectEntityId: null,
        threadId: null,
        source: { kind: "channel", name: "Channel", private: false },
        excerpt: message.body,
        eventCursor: "cursor",
      };
      const data = {
        "crm/account": {
          account,
          level,
          contacts:
            failure === "missing-account-contact" ? [] : [{ contact: profile, affiliation }],
          deals: [],
        },
        "contacts/record": {
          profile,
          level,
          identifiers: [],
          addresses: [],
          urls: [],
          archivedAt: null,
          affiliations: failure === "missing-affiliation" ? [] : [{ account, affiliation }],
        },
        "crm/deal": {
          deal: {
            entityId: customer.dealEntityId,
            accountEntityId: customer.accountEntityId,
            organizationId: user.organizationId,
            entityType: "deal",
            title: "Deal",
            ownerActorEntityId: user.actorEntityId!,
            stageId: "stage",
            outcome: "open",
            amount: "12000",
            currency: "USD",
            expectedCloseDate: null,
            closedAt: null,
            stageEnteredAt: at,
            summary: "",
            lostReason: null,
            version: 1,
            archivedAt: null,
          },
          account,
          level,
          contacts: [{ contact: profile, isPrimary: failure !== "nonprimary-deal-contact" }],
        },
        "tasks/project": {
          tasks,
          project: {
            entityId: failure === "wrong-project" ? "wrong" : workspace.projectEntityId,
            organizationId: user.organizationId,
            entityType: "project",
            name: "Project",
            description: "",
            image: null,
          },
          level: failure === "readonly-project" ? "view" : "owner",
          members: [],
          actors: [],
          links: [],
        },
        "messaging/conversations": [
          {
            id: url.searchParams.get("conversationId")!,
            organizationId: user.organizationId,
            kind: isDiscussion ? "group" : "channel",
            taskEntityId: isDiscussion ? workspace.taskEntityId : null,
            dmKey: null,
            name: isDiscussion ? "Discussion" : "Channel",
            private: isDiscussion,
            createdBy: user.userId,
            createdAt: at,
            organizations: [],
            partner: false,
            members: [],
            joined: failure !== "unjoined",
            canShare: true,
            canManage: true,
            canPost: failure !== "cannot-post",
            task: isDiscussion
              ? {
                  taskEntityId: failure === "wrong-task" ? "wrong" : workspace.taskEntityId,
                  projectEntityId: workspace.projectEntityId,
                  title: "Follow up",
                }
              : null,
          },
        ],
        "messaging/messages":
          failure === "empty" ||
          (failure === "empty-history" &&
            url.searchParams.get("conversationId") === workspace.conversationId &&
            !url.searchParams.has("aroundMessageId"))
            ? []
            : messagePage,
        "crm/follow-ups": {
          tasks:
            failure === "unlinked"
              ? []
              : tasks.map(
                  ({
                    entityId,
                    projectEntityId,
                    title,
                    status,
                    dueDate,
                    assigneeActorEntityId,
                  }) => ({
                    entityId,
                    projectEntityId,
                    title,
                    status,
                    dueDate,
                    assigneeActorEntityId,
                  }),
                ),
          nextAction: null,
          scope: "readable linked open tasks; dueDate is date-only",
        },
        "crm/report": {
          won: failure === "empty-report" ? 0 : 1,
          lost: failure === "missing-lost" ? 0 : 1,
          open: [],
          closed: [],
          winRate: 0.5,
          from: url.searchParams.get("from") ?? at,
          to: url.searchParams.get("to") ?? at,
          dateBasis: "current outcome and latest actual close; [from,to)",
          scope: "readable unarchived deals",
          generatedAt: at,
          closedDeals: [],
          closedDealsTruncated: false,
          exceptions: { overdue: 0, dueToday: 0, noNextAction: 0, stale: 0 },
          asOf: at,
          timezone: "UTC",
          staleDays: 30,
          filters: { staleDays: 30 },
          exceptionScope:
            "readable linked open tasks and readable meaningful interactions explicitly linked to the deal; unscheduled tasks do not count as a scheduled next action; stale falls back to deal creation when no readable explicitly linked touch exists",
        },
        "context/notifications/groups": {
          items:
            failure === "empty-notifications"
              ? []
              : [
                  {
                    ...event,
                    groupKey:
                      failure === "wrong-group"
                        ? "thread:other"
                        : `thread:${notification.messageId}`,
                    unreadCount: 0,
                    count: 1,
                    otherActorCount: 0,
                    mixedKinds: false,
                    newestCursor: "cursor",
                  },
                ],
          nextCursor: null,
        },
        "context/notifications/events": {
          items: failure === "missing-mention" ? [] : [event],
          nextCursor: null,
        },
      } satisfies PreflightData;
      const result = Object.entries(data).find(([path]) => `/api/v1/${path}` === url.pathname)?.[1];
      if (!result) return new Response("Unexpected endpoint", { status: 404 });
      return Response.json({ success: true, data: result });
    },
  });
  const fixture = sampleFixture(server.url.origin);
  const directory = await mkdtemp(
    join(
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir(),
      "preflight-",
    ),
  );
  const fixturePath = join(directory, "users.json");
  const options = { fixturePath, apiUrl: fixture.apiUrl, origin: fixture.origin };
  try {
    await Bun.write(fixturePath, JSON.stringify(fixture));
    expect((await preflight(options)).seed).toEqual(fixture.seed);
    expect(authenticated.size).toBe(fixture.users.length);
    expect(reports).toBe(8);
    for (const [mode, expected] of [
      ["denied", "403 denied"],
      ["service-error", "Contact not accessible"],
      ["wrong-membership", "Fixture organization membership mismatch"],
      ["wrong-session", "Fixture active session mismatch"],
      ["empty", "Missing accessible channel or populated task discussion"],
      ["empty-history", "Missing channel history"],
      ["unjoined", "Missing accessible channel or populated task discussion"],
      ["cannot-post", "Missing accessible channel or populated task discussion"],
      ["unlinked", "Missing accessible task or structured CRM follow-up"],
      ["unverified", "Fixture identity mismatch or unverified account"],
      ["wrong-task", "Missing accessible channel or populated task discussion"],
      ["read-only", "Required fixture resources are not editable"],
      ["readonly-project", "Required fixture resources are not editable"],
      ["wrong-project", "Fixture project identity mismatch"],
      ["wrong-contact", "Missing or mismatched CRM fixture"],
      ["missing-affiliation", "Missing or mismatched CRM fixture"],
      ["missing-account-contact", "Missing or mismatched CRM fixture"],
      ["nonprimary-deal-contact", "Missing or mismatched CRM fixture"],
      ["empty-report", "Missing won/lost fixtures"],
      ["missing-lost", "Missing won/lost fixtures"],
      ...[
        "empty-notifications",
        "wrong-group",
        "missing-mention",
        "wrong-event-conversation",
        "deleted-source",
        "wrong-sender",
        "wrong-recipient",
      ].map((mode) => [
        mode,
        "Missing notification group, recipient mention, or accessible source message",
      ]),
    ]) {
      failure = mode!;
      const outcome = await preflight(options).then(
        () => "unexpected success",
        (error: Error) => error.message,
      );
      expect(outcome).toContain(expected!);
    }
  } finally {
    await server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
