import { callMessaging } from "../test-support/api";
import { provisionVerifiedAccount, type TestAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionMember, provisionWorkspace } from "../test-support/organizations";
import { expect, test, type Page, type Request } from "@playwright/test";
import { randomUUID } from "node:crypto";

function account(label: string, suffix: string): TestAccount {
  return {
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@example.test`,
    password: `Messaging-${randomUUID()}!`,
  };
}

async function sendMessage(page: Page, label: string, body: string) {
  const input = page.getByRole("textbox", { name: label, exact: true });
  await input.fill(body);
  const [transport] = await Promise.all([
    page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/messaging/messages",
      { timeout: 15_000 },
    ),
    input.press("Enter"),
  ]);
  await expect(input).toHaveValue("");
  return transport;
}

async function createConversation(
  page: Page,
  kind: "dm" | "group" | "channel",
  name: string,
  emails: string[] = [],
  isPrivate = false,
) {
  const button = {
    dm: "New direct message",
    group: "New group message",
    channel: "Create channel",
  }[kind];
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  if (kind === "channel") {
    await sidebar.getByRole("button", { name: button, exact: true }).click();
  } else {
    await sidebar.getByRole("button", { name: "New message", exact: true }).click();
    await page.getByRole("menuitem", { name: button, exact: true }).click();
  }
  if (kind !== "dm") {
    await page
      .getByLabel(kind === "channel" ? "Channel name" : "Group name (optional)", { exact: true })
      .fill(name);
  }
  await page
    .getByLabel(kind === "channel" ? "Add people (optional)" : "To", { exact: true })
    .fill(emails.join(", "));
  if (isPrivate && kind === "channel")
    await page.getByRole("checkbox", { name: "Make this channel private" }).check();
  const [transport] = await Promise.all([
    page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/messaging/conversations",
      { timeout: 15_000 },
    ),
    page
      .getByRole("button", {
        name: kind === "channel" ? "Create channel" : "Start conversation",
        exact: true,
      })
      .last()
      .click(),
  ]);
  if (kind !== "dm") await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return transport;
}

async function expectRejectedOrigins(page: Page, transport: Request) {
  const headers = await transport.allHeaders();
  delete headers.origin;
  delete headers.cookie;
  delete headers["content-length"];
  for (const origin of [undefined, "https://foreign.example.test", "null"]) {
    const replayHeaders = { ...headers };
    if (origin !== undefined) replayHeaders.origin = origin;
    const response = await page.request.post(transport.url(), {
      headers: replayHeaders,
      data: transport.postDataBuffer()!,
    });
    expect(response.status(), `An API write rejects ${origin ?? "missing"} Origin`).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  }
}

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function openThread(page: Page, conversation: string, body: string) {
  await page
    .getByRole("region", { name: conversation, exact: true })
    .getByRole("article")
    .filter({ hasText: body })
    .getByRole("button", { name: /^(Reply in thread|\d+ replies?)$/ })
    .click();
  await expect(page.getByRole("complementary", { name: "Thread", exact: true })).toContainText(
    body,
  );
  await expect(
    page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByRole("log", { name: "Messages", exact: true }),
  ).toBeVisible();
}

async function messageId(page: Page, id: string, body: string) {
  const result = await callMessaging<{ id: string; body: string }[]>(page, "listMessages", {
    conversationId: id,
  });
  expect(result.error, "The sender can inspect their own message").toBeNull();
  const message = result.data!.find((item) => item.body === body);
  expect(message, "The UI-sent message is persisted").toBeTruthy();
  return message!.id;
}

async function conversationId(page: Page, name: string) {
  const result = await callMessaging<{ id: string; name: string }[]>(page, "listConversations");
  expect(result.error, "The signed-in user can list accessible conversations").toBeNull();
  const conversation = result.data!.find((item) => item.name === name);
  expect(conversation, "The UI-created conversation is persisted").toBeTruthy();
  return conversation!.id;
}

async function expectDeniedAccess(page: Page, id: string, messageId: string, email: string) {
  for (const [name, data] of [
    ["listMessages", { conversationId: id }],
    ["listMessages", { conversationId: id, threadId: messageId }],
    ["sendMessage", { conversationId: id, body: "Unauthorized message" }],
    ["sendMessage", { conversationId: id, body: "Unauthorized reply", threadId: messageId }],
    ["toggleReaction", { messageId, emoji: "👍" }],
    ["addMembers", { conversationId: id, emails: [email] }],
  ] as const) {
    const result = await callMessaging(page, name, data);
    expect(
      result.errorCode,
      `A nonparticipant cannot call ${name} for a private conversation`,
    ).toBe("NOT_FOUND");
    expect(result.data, "Denied operations do not expose conversation data").toBeNull();
  }
}

for (const scenario of ["channels", "direct messages", "shared access"] as const) {
  test(`messaging ${scenario} keep conversations, threads, and organizations isolated`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(360_000);
    const suffix = randomUUID();
    const owner = account("Sender", suffix);
    const member = account("Teammate", suffix);
    const external = account("Recipient", suffix);
    const outsider = account("Outsider", suffix);
    const mailpit = new Mailpit(request);
    const participants =
      scenario === "channels" ? [owner, member] : [owner, member, external, outsider];
    const contexts = await Promise.all(participants.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const [senderPage, memberPage, recipientPage, outsiderPage] = pages;
    const publicChannel = `public-${suffix}`;
    const privateChannel = `private-${suffix}`;
    const group = `Launch ${suffix}`;

    try {
      await test.step("create verified users and separate workspaces through auth and Mailpit", async () => {
        await Promise.all(pages.map((page) => page.clock.install()));
        await Promise.all(
          pages.map((page, index) => provisionVerifiedAccount(page, mailpit, participants[index]!)),
        );
        await Promise.all([
          provisionWorkspace(senderPage, `Messaging ${suffix}`, `messaging-${suffix}`),
          ...(scenario === "channels"
            ? []
            : [
                provisionWorkspace(recipientPage, `External ${suffix}`, `external-${suffix}`),
                provisionWorkspace(outsiderPage, `Unrelated ${suffix}`, `unrelated-${suffix}`),
              ]),
        ]);
      });

      await test.step("invite a teammate without sharing organization access with external users", async () => {
        await provisionMember(senderPage, memberPage, member.email);
        await expect(
          memberPage.getByRole("button", { name: `Messaging ${suffix} ▾`, exact: true }),
        ).toBeVisible();
        await senderPage.getByRole("button", { name: "Messages", exact: true }).click();
      });

      if (scenario !== "channels") {
        for (const [name, isPrivate] of [
          [publicChannel, false],
          [privateChannel, true],
        ] as const) {
          const created = await callMessaging<{ id: string }>(senderPage, "createConversation", {
            kind: "channel",
            name,
            private: isPrivate,
            emails: [],
          });
          expect(created.error).toBeNull();
          const sent = await callMessaging(senderPage, "sendMessage", {
            conversationId: created.data!.id,
            body: isPrivate ? "Private channel only" : "Public channel only",
          });
          expect(sent.error).toBeNull();
        }
        if (scenario === "shared access") {
          const created = await callMessaging<{ id: string }>(senderPage, "createConversation", {
            kind: "group",
            name: group,
            emails: [member.email, external.email],
          });
          expect(created.error).toBeNull();
          const sent = await callMessaging(senderPage, "sendMessage", {
            conversationId: created.data!.id,
            body: "Private group delivery",
          });
          expect(sent.error).toBeNull();
        }
        await senderPage.reload();
        await openConversation(senderPage, privateChannel);
      }

      if (scenario === "channels") {
        await test.step("create public and private channels and keep their timelines separate", async () => {
          const createTransport = await createConversation(senderPage, "channel", publicChannel);
          const sendTransport = await sendMessage(
            senderPage,
            `Message #${publicChannel}`,
            "Public channel only",
          );
          await expectRejectedOrigins(senderPage, createTransport);
          await expectRejectedOrigins(senderPage, sendTransport);
          const conversations = await callMessaging<{ name: string }[]>(
            senderPage,
            "listConversations",
          );
          expect(conversations.error).toBeNull();
          expect(conversations.data!.filter((item) => item.name === publicChannel)).toHaveLength(1);
          const publicId = await conversationId(senderPage, publicChannel);
          const messages = await callMessaging<{ body: string }[]>(senderPage, "listMessages", {
            conversationId: publicId,
          });
          expect(messages.error).toBeNull();
          expect(messages.data!.filter((item) => item.body === "Public channel only")).toHaveLength(
            1,
          );
          await createConversation(senderPage, "channel", privateChannel, [], true);
          await sendMessage(senderPage, `Message #${privateChannel}`, "Private channel only");
          await expect(senderPage.getByRole("log", { name: "Messages" })).not.toContainText(
            "Public channel only",
          );
          await memberPage.reload();
          await openConversation(memberPage, publicChannel);
          await expect(memberPage.getByRole("log", { name: "Messages" })).toContainText(
            "Public channel only",
          );
          await expect(
            memberPage.getByRole("button", { name: privateChannel, exact: true }),
          ).toHaveCount(0);
          await sendMessage(memberPage, `Message #${publicChannel}`, "Teammate public reply");
          await openConversation(senderPage, publicChannel);
          await expect(senderPage.getByRole("log", { name: "Messages" })).toContainText(
            "Teammate public reply",
          );
          await expect(senderPage.getByRole("log", { name: "Messages" })).not.toContainText(
            "Private channel only",
          );
        });

        await test.step("thread replies remain outside timelines and other threads", async () => {
          const timeline = senderPage.getByRole("region", { name: publicChannel, exact: true });
          await timeline
            .getByRole("article")
            .filter({ hasText: "Public channel only" })
            .getByRole("button", { name: "Reply in thread", exact: true })
            .click();
          await sendMessage(senderPage, "Reply in thread…", "First thread secret");
          await expect(
            senderPage.getByRole("complementary", { name: "Thread" }).getByRole("log"),
          ).toContainText("First thread secret");
          await expect(timeline.getByRole("log")).not.toContainText("First thread secret");
          await senderPage.getByRole("button", { name: "Close thread" }).click();
          await openThread(senderPage, publicChannel, "Teammate public reply");
          await expect(senderPage.getByRole("complementary", { name: "Thread" })).not.toContainText(
            "First thread secret",
          );
          await sendMessage(senderPage, "Reply in thread…", "Second thread secret");
          await expect(
            senderPage.getByRole("complementary", { name: "Thread" }).getByRole("log"),
          ).toContainText("Second thread secret");
          await senderPage.getByRole("button", { name: "Close thread" }).click();
          await openConversation(senderPage, privateChannel);
          await expect(senderPage.getByRole("complementary", { name: "Thread" })).toHaveCount(0);
          await expect(senderPage.getByRole("log")).not.toContainText("thread secret");
          const publicId = await conversationId(senderPage, publicChannel);
          const privateId = await conversationId(senderPage, privateChannel);
          const publicRoot = await messageId(senderPage, publicId, "Public channel only");
          for (const name of ["listMessages", "sendMessage"] as const) {
            const result = await callMessaging(senderPage, name, {
              conversationId: privateId,
              threadId: publicRoot,
              body: "Rejected cross-channel thread reply",
            });
            expect(result.error, "A thread root cannot be used in another channel").toBe(
              "Thread must be a root message in this conversation.",
            );
          }
        });

        await test.step("emoji insertion, persisted reaction toggles, and safe Markdown work in the UI", async () => {
          const input = senderPage.getByRole("textbox", {
            name: `Message #${privateChannel}`,
            exact: true,
          });
          await input.fill("Composer emoji ");
          await senderPage.getByRole("button", { name: "Add emoji", exact: true }).click();
          await senderPage.getByRole("button", { name: "🚀", exact: true }).click();
          await expect(input).toHaveValue("Composer emoji 🚀");
          await input.press("Enter");
          const emojiMessage = senderPage
            .getByRole("article")
            .filter({ hasText: "Composer emoji 🚀" });
          await expect(emojiMessage).toBeVisible();
          await emojiMessage.getByRole("button", { name: "React to message", exact: true }).click();
          await senderPage.getByRole("button", { name: "👍", exact: true }).click();
          await expect(
            emojiMessage.getByRole("button", { name: "👍, 1 reactions", exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await senderPage.reload();
          await openConversation(senderPage, privateChannel);
          await expect(
            emojiMessage.getByRole("button", { name: "👍, 1 reactions", exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await emojiMessage.getByRole("button", { name: "👍, 1 reactions", exact: true }).click();
          await expect(
            emojiMessage.getByRole("button", { name: "👍, 1 reactions", exact: true }),
          ).toHaveCount(0);
          await sendMessage(
            senderPage,
            `Message #${privateChannel}`,
            '**Safe bold** and _safe italic_ and `safe code`\n\n[Safe link](https://example.com)\n\n[Unsafe link](javascript:alert(1))\n\n<img src=x onerror="window.__messagingXss=true">\n<script>window.__messagingXss=true</script>',
          );
          const markdown = senderPage.getByRole("article").filter({ hasText: "Safe bold" });
          await expect(markdown.locator("strong")).toHaveText("Safe bold");
          await expect(markdown.locator("em")).toHaveText("safe italic");
          await expect(markdown.locator("code")).toHaveText("safe code");
          await expect(
            markdown.getByRole("link", { name: "Safe link", exact: true }),
          ).toHaveAttribute("href", "https://example.com");
          await expect(markdown.locator('a[href^="javascript:"]')).toHaveCount(0);
          await expect(markdown.locator("script, img")).toHaveCount(0);
          expect(await senderPage.evaluate("window.__messagingXss")).toBeUndefined();
        });
      }

      if (scenario === "direct messages") {
        await test.step("a same-workspace private DM is persisted and hidden from nonparticipants", async () => {
          await createConversation(senderPage, "dm", "", [member.email]);
          await expect(
            senderPage.getByRole("heading", { name: member.name, exact: true }),
          ).toBeVisible();
          await sendMessage(senderPage, `Message ${member.name}`, "Same-workspace private DM");
          await memberPage.reload();
          await openConversation(memberPage, owner.name);
          await expect(memberPage.getByRole("log")).toContainText("Same-workspace private DM");
          await memberPage.reload();
          await openConversation(memberPage, owner.name);
          await expect(memberPage.getByRole("log")).toContainText("Same-workspace private DM");
          const id = await conversationId(senderPage, member.name);
          const rootId = await messageId(senderPage, id, "Same-workspace private DM");
          for (const [page, user] of [
            [recipientPage, external],
            [outsiderPage, outsider],
          ] as const) {
            const result = await callMessaging<{ id: string }[]>(page, "listConversations");
            expect(result.error).toBeNull();
            expect(result.data!.map((item) => item.id)).not.toContain(id);
            await expectDeniedAccess(page, id, rootId, user.email);
          }
        });

        await test.step("a private DM reaches another workspace in an independent browser context", async () => {
          await createConversation(senderPage, "dm", "", [external.email]);
          await expect(
            senderPage.getByRole("heading", { name: external.name, exact: true }),
          ).toBeVisible();
          await sendMessage(senderPage, `Message ${external.name}`, "Cross-workspace delivery");
          await recipientPage.reload();
          await openConversation(recipientPage, owner.name);
          await expect(recipientPage.getByRole("log")).toContainText("Cross-workspace delivery");
          await sendMessage(recipientPage, `Message ${owner.name}`, "Cross-workspace receipt");
          await senderPage.clock.fastForward(3000);
          await expect(senderPage.getByRole("log")).toContainText("Cross-workspace receipt");
          await expect(
            recipientPage.getByRole("button", { name: `External ${suffix} ▾`, exact: true }),
          ).toBeVisible();
          await expect(
            recipientPage.getByRole("button", { name: publicChannel, exact: true }),
          ).toHaveCount(0);
          await expect(
            recipientPage.getByRole("button", { name: privateChannel, exact: true }),
          ).toHaveCount(0);
        });

        await test.step("private groups deliver to selected users without exposing other conversations", async () => {
          await createConversation(senderPage, "group", group, [member.email, external.email]);
          await sendMessage(senderPage, `Message ${group}`, "Private group delivery");
          await Promise.all(
            [memberPage, recipientPage].map(async (page) => {
              await page.reload();
              await openConversation(page, group);
              await expect(page.getByRole("log")).toContainText("Private group delivery");
              await expect(page.getByRole("log")).not.toContainText("Cross-workspace delivery");
            }),
          );
        });

        await test.step("nonparticipants cannot list, read, send, react, or use private threads through server functions", async () => {
          const id = await conversationId(senderPage, privateChannel);
          const rootId = await messageId(senderPage, id, "Private channel only");
          await expectDeniedAccess(memberPage, id, rootId, member.email);
          await expectDeniedAccess(outsiderPage, id, rootId, outsider.email);
          const groupId = await conversationId(senderPage, group);
          const groupRoot = await messageId(senderPage, groupId, "Private group delivery");
          await expectDeniedAccess(outsiderPage, groupId, groupRoot, outsider.email);
          const result = await callMessaging<{ id: string }[]>(outsiderPage, "listConversations");
          expect(result.error).toBeNull();
          expect(result.data!.map((item) => item.id)).not.toContain(id);
          expect(result.data!.map((item) => item.id)).not.toContain(groupId);
        });
      }

      if (scenario === "shared access") {
        await test.step("explicitly adding a person grants private-channel access", async () => {
          await openConversation(senderPage, privateChannel);
          await senderPage.getByRole("button", { name: "Add people", exact: true }).click();
          const input = senderPage.getByLabel("Add people by exact email address", { exact: true });
          await input.fill(member.email);
          await input
            .locator("xpath=ancestor::form")
            .getByRole("button", { name: "Add people", exact: true })
            .click();
          await expect(input).toHaveCount(0);
          await memberPage.reload();
          await openConversation(memberPage, privateChannel);
          await expect(memberPage.getByRole("log")).toContainText("Private channel only");
          await sendMessage(memberPage, `Message #${privateChannel}`, "Invited private reply");
          await senderPage.clock.fastForward(3000);
          await expect(senderPage.getByRole("log")).toContainText("Invited private reply");
          await senderPage.getByRole("button", { name: "Add people", exact: true }).click();
          await input.fill(external.email);
          await input
            .locator("xpath=ancestor::form")
            .getByRole("button", { name: "Add people", exact: true })
            .click();
          await expect(input).toHaveCount(0);
          await recipientPage.reload();
          await openConversation(recipientPage, privateChannel);
          await expect(recipientPage.getByRole("log")).toContainText("Private channel only");
          await sendMessage(
            recipientPage,
            `Message #${privateChannel}`,
            "External shared-channel reply",
          );
          await Promise.all([
            senderPage.clock.fastForward(3000),
            memberPage.clock.fastForward(3000),
          ]);
          await expect(senderPage.getByRole("log")).toContainText("External shared-channel reply");
          await expect(memberPage.getByRole("log")).toContainText("External shared-channel reply");
          await expect(
            recipientPage.getByRole("button", { name: publicChannel, exact: true }),
          ).toHaveCount(0);
        });

        await test.step("teammates exchange replies in the same private-channel thread", async () => {
          await Promise.all(
            [senderPage, memberPage].map((page) =>
              openThread(page, privateChannel, "Private channel only"),
            ),
          );
          await sendMessage(senderPage, "Reply in thread…", "Owner shared-thread reply");
          await memberPage.clock.fastForward(3000);
          await expect(
            memberPage.getByRole("complementary", { name: "Thread" }).getByRole("log"),
          ).toContainText("Owner shared-thread reply");
          await sendMessage(memberPage, "Reply in thread…", "Teammate shared-thread reply");
          await senderPage.clock.fastForward(3000);
          await expect(
            senderPage.getByRole("complementary", { name: "Thread" }).getByRole("log"),
          ).toContainText("Teammate shared-thread reply");
        });

        await test.step("shared-thread replies cross workspace boundaries, persist, and remain private", async () => {
          await openThread(recipientPage, privateChannel, "Private channel only");
          const replies = [
            [owner, "Owner shared-thread reply"],
            [member, "Teammate shared-thread reply"],
            [external, "External shared-thread reply"],
          ] as const;
          for (const [, body] of replies.slice(0, 2)) {
            await expect(
              recipientPage.getByRole("complementary", { name: "Thread" }).getByRole("log"),
            ).toContainText(body);
          }
          await sendMessage(recipientPage, "Reply in thread…", "External shared-thread reply");
          await Promise.all([
            senderPage.clock.fastForward(3000),
            memberPage.clock.fastForward(3000),
          ]);
          await Promise.all(
            [senderPage, memberPage, recipientPage].map(async (page) => {
              const thread = page.getByRole("complementary", { name: "Thread" });
              for (const [author, body] of replies) {
                const reply = thread
                  .getByRole("log")
                  .getByRole("article")
                  .filter({ hasText: body });
                await expect(reply).toHaveCount(1);
                await expect(reply).toContainText(author.name);
              }
              await page.reload();
              await openConversation(page, privateChannel);
              await openThread(page, privateChannel, "Private channel only");
              for (const [, body] of replies) {
                await expect(thread.getByRole("log")).toContainText(body);
                await expect(
                  page.getByRole("region", { name: privateChannel, exact: true }).getByRole("log"),
                ).not.toContainText(body);
              }
              await page.getByRole("button", { name: "Close thread", exact: true }).click();
              await openThread(page, privateChannel, "External shared-channel reply");
              for (const [, body] of replies) {
                await expect(thread.getByRole("log")).not.toContainText(body);
              }
              await page.getByRole("button", { name: "Close thread", exact: true }).click();
            }),
          );
          const id = await conversationId(senderPage, privateChannel);
          const rootId = await messageId(senderPage, id, "Private channel only");
          await expectDeniedAccess(outsiderPage, id, rootId, outsider.email);
          await outsiderPage.reload();
          await expect(
            outsiderPage.getByRole("heading", {
              name: "Your conversations start here",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            outsiderPage.getByRole("button", { name: privateChannel, exact: true }),
          ).toHaveCount(0);
          for (const [, body] of replies) {
            await expect(outsiderPage.getByText(body, { exact: true })).toHaveCount(0);
          }
          await expect(
            recipientPage.getByRole("button", { name: `External ${suffix} ▾`, exact: true }),
          ).toBeVisible();
        });

        await test.step("mobile composers and conversation navigation remain usable at narrow widths", async () => {
          const desktopViewport = senderPage.viewportSize();
          try {
            for (const viewport of [
              { width: 320, height: 740 },
              { width: 390, height: 844 },
            ]) {
              await senderPage.setViewportSize(viewport);
              const input = senderPage.getByRole("textbox", {
                name: `Message #${privateChannel}`,
                exact: true,
              });
              const form = input.locator("xpath=ancestor::form");
              const body = `Mobile receipt at ${viewport.width}x${viewport.height}`;
              for (const [label, marker] of [
                ["Bold text", "**"],
                ["Italic text", "_"],
                ["Code text", "`"],
              ] as const) {
                const button = form.getByRole("button", { name: label, exact: true });
                await expect(button).toBeVisible();
                await expect(button).toBeInViewport({ ratio: 1 });
                await button.click({ trial: true });
                await input.fill(body);
                await input.selectText();
                await button.click();
                await expect(input).toHaveValue(`${marker}${body}${marker}`);
              }
              const send = form.getByRole("button", { name: "Send", exact: true });
              await expect(send).toBeVisible();
              await expect(send).toBeInViewport({ ratio: 1 });
              await send.click({ trial: true });
              await send.click();
              await expect(input).toHaveValue("");
              await expect(senderPage.getByRole("log")).toContainText(body);
              await memberPage.clock.fastForward(3000);
              await expect(memberPage.getByRole("log")).toContainText(body);

              const sidebar = senderPage.getByRole("complementary", { name: "Conversations" });
              const show = senderPage.getByRole("button", {
                name: "Show conversations",
                exact: true,
              });
              await expect(show).toBeInViewport({ ratio: 1 });
              await expect(show).toHaveAttribute("aria-expanded", "false");
              await expect(sidebar).toBeHidden();
              await show.click();
              const back = senderPage.getByRole("button", {
                name: "Back to messages",
                exact: true,
              });
              await expect(back).toBeInViewport({ ratio: 1 });
              await expect(back).toHaveAttribute("aria-expanded", "true");
              await expect(sidebar).toBeVisible();
              await expect(input).toBeHidden();
              await back.click();
              await expect(sidebar).toBeHidden();
              await expect(show).toHaveAttribute("aria-expanded", "false");
              await expect(input).toBeVisible();
            }
          } finally {
            if (desktopViewport) await senderPage.setViewportSize(desktopViewport);
          }
        });

        await test.step("revoked workspace membership hides cached private messages after refetch", async () => {
          await openConversation(memberPage, group);
          await expect(memberPage.getByRole("log")).toContainText("Private group delivery");
          const organizationResponse = await senderPage.request.get(
            "/api/auth/organization/get-full-organization",
          );
          expect(organizationResponse.ok()).toBe(true);
          const organization: { id: string } = await organizationResponse.json();
          const removed = await senderPage.request.post("/api/auth/organization/remove-member", {
            headers: { origin: new URL(senderPage.url()).origin },
            data: { memberIdOrEmail: member.email, organizationId: organization.id },
          });
          expect(removed.ok(), "The owner revokes the teammate's workspace membership").toBe(true);
          await memberPage.bringToFront();
          await memberPage.clock.fastForward(5000);
          await expect(memberPage.getByRole("alert").first()).toBeVisible();
          await expect(memberPage.getByText("Private group delivery", { exact: true })).toHaveCount(
            0,
          );
          await expect(memberPage.getByRole("log")).toHaveCount(0);
        });
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
}

test("a stale workspace tab cannot read or mutate the newly active workspace", async ({
  page,
  context,
  request,
}) => {
  const suffix = randomUUID();
  const user = account("Multitab", suffix);
  const firstWorkspace = `First ${suffix}`;
  const secondWorkspace = `Second ${suffix}`;
  const firstChannel = `first-${suffix}`;
  const secondChannel = `second-${suffix}`;
  const changed = "Your active workspace changed. Reload this page to continue.";
  await provisionVerifiedAccount(page, new Mailpit(request), user);
  await provisionWorkspace(page, firstWorkspace, `first-${suffix}`);
  await createConversation(page, "channel", firstChannel, [], true);
  await sendMessage(page, `Message #${firstChannel}`, "Workspace A private contents");
  const firstConversationId = await conversationId(page, firstChannel);
  const firstOrganizationResponse = await page.request.get(
    "/api/auth/organization/get-full-organization",
  );
  expect(firstOrganizationResponse.ok()).toBe(true);
  const firstOrganization: { id: string } = await firstOrganizationResponse.json();

  const otherTab = await context.newPage();
  await provisionWorkspace(otherTab, secondWorkspace, `second-${suffix}`);
  await createConversation(otherTab, "channel", secondChannel, [], true);
  await sendMessage(otherTab, `Message #${secondChannel}`, "Workspace B private contents");

  await page.bringToFront();
  const unavailable = page
    .getByRole("alert")
    .filter({ has: page.getByRole("heading", { name: "Workspace unavailable", exact: true }) });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText(
    "Check that you’re signed in to the right workspace and still have access, then try again.",
  );
  await expect(
    page.getByRole("button", { name: `${firstWorkspace} ▾`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Workspace B private contents", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: secondChannel, exact: true })).toHaveCount(0);

  await expect(page.getByText("Workspace A private contents", { exact: true })).toHaveCount(0);
  const staleSend = await callMessaging(page, "sendMessage", {
    organizationId: firstOrganization.id,
    conversationId: firstConversationId,
    body: "Rejected stale message",
  });
  expect(staleSend.error).toBe(changed);

  await expect(page.getByRole("button", { name: "Create channel", exact: true })).toHaveCount(0);
  const staleCreate = await callMessaging(page, "createConversation", {
    organizationId: firstOrganization.id,
    kind: "channel",
    name: `stale-${suffix}`,
    private: true,
    emails: [],
  });
  expect(staleCreate.error).toBe(changed);

  await otherTab.reload();
  await openConversation(otherTab, secondChannel);
  await expect(otherTab.getByRole("log")).toContainText("Workspace B private contents");
  await expect(otherTab.getByRole("log")).not.toContainText("Rejected stale message");
  await expect(otherTab.getByRole("button", { name: `stale-${suffix}`, exact: true })).toHaveCount(
    0,
  );
});
