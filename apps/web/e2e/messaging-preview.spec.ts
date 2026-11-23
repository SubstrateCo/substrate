import { conversationButton, inviteMember, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("MVP message controls preserve discussions and show clear ownership actions", async ({
  account,
  actors: sharedActors,
  client,
}) => {
  test.setTimeout(60_000);
  const invitation = await inviteMember(account, sharedActors.member.email);
  expect(
    (
      await sharedActors.member.request.post("/api/auth/organization/accept-invitation", {
        data: { invitationId: invitation.id },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await sharedActors.member.request.post("/api/auth/organization/set-active", {
        data: { organizationId: account.organizationId },
      })
    ).ok(),
  ).toBe(true);
  const actors = {
    sender: account,
    member: { ...sharedActors.member, organizationId: account.organizationId },
  };
  try {
    expect(
      (
        await account.request.post("/api/auth/organization/update", {
          data: { organizationId: account.organizationId, data: { name: "Northstar" } },
        })
      ).ok(),
    ).toBe(true);
    for (const [actor, name] of [
      [actors.sender, "Alex Morgan"],
      [actors.member, "Maya Chen"],
    ] as const) {
      expect((await actor.request.post("/api/auth/update-user", { data: { name } })).ok()).toBe(
        true,
      );
      actor.name = name;
    }
    sharedActors.member.name = actors.member.name;
    const channel = await post<{ id: string; name: string }>(
      actors.sender,
      "messaging/conversations",
      {
        kind: "channel",
        name: "launch-room",
        private: true,
        emails: [actors.member.email],
      },
    );
    const design = await post<{ id: string; name: string }>(
      actors.sender,
      "messaging/conversations",
      {
        kind: "channel",
        name: "design-review",
        private: true,
        emails: [actors.member.email],
      },
    );
    const dm = await post<{ id: string }>(actors.sender, "messaging/conversations", {
      kind: "dm",
      emails: [actors.member.email],
    });
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: "The launch checklist is ready. Let’s use this thread for the final review.",
    });
    await post(actors.member, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: "Design is signed off. I’ll check the last onboarding screens before lunch.",
    });
    await post(actors.member, "messaging/messages", {
      conversationId: channel.id,
      body: "Everything looks good from design. The handoff notes are in the project.",
    });
    const original = "We’re aiming for Thursday. I’ll confirm the release window shortly.";
    const corrected =
      "We’re confirmed for Thursday at 10:00. Thanks for the final checks, everyone.";
    await post(actors.sender, "messaging/messages", { conversationId: channel.id, body: original });
    const sender = await client(actors.sender);
    const { page } = sender;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visit(sender, channel.id);
    await post(actors.member, "messaging/messages", {
      conversationId: design.id,
      body: "The revised onboarding screens are ready for your review.",
    });
    await post(actors.member, "messaging/messages", {
      conversationId: dm.id,
      body: "Quick update: the final design review is complete.",
    });
    await expect(conversationButton(page, design.name)).toBeVisible();
    await expect(
      conversationButton(page, design.name).getByLabel("1 unread message", { exact: true }),
    ).toBeVisible();
    await expect(
      conversationButton(page, actors.member.name).getByLabel("1 unread message", { exact: true }),
    ).toBeVisible();
    const message = page.getByRole("article").filter({ hasText: original });
    await message.getByRole("button", { name: "More message actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
    const edit = message.getByRole("textbox", { name: "Edit message", exact: true });
    await edit.fill(corrected);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(edit).toHaveCount(0);
    const edited = page.getByRole("article").filter({ hasText: corrected });
    await expect(edited).toContainText("Edited");
    await page
      .getByRole("textbox", { name: /^Message / })
      .fill("I’ll post the release notes here once the rollout starts.");
    await page.getByRole("button", { name: "Members, 2 members", exact: true }).click();
    await page.getByRole("button", { name: "Remove Maya Chen", exact: true }).click();
    const removal = page.getByRole("dialog", { name: /Remove Maya Chen/ });
    await expect(removal).toBeVisible();
    await removal.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.keyboard.press("Escape");
    await edited.getByRole("button", { name: "More message actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Delete message?", exact: true });
    await expect(deletion).toBeVisible();
    await deletion.getByRole("button", { name: "Delete message", exact: true }).click();
    await expect(page.getByText(corrected, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Message deleted", { exact: true })).toBeVisible();
  } finally {
    expect(
      (
        await sharedActors.member.request.post("/api/auth/organization/set-active", {
          data: { organizationId: sharedActors.member.organizationId },
        })
      ).ok(),
    ).toBe(true);
  }
});
