import { acceptCollaboration, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test.afterEach(async ({ actors }) => {
  // These accounts are shared with other specs in this worker.
  for (const actor of [actors.sender, actors.partner]) {
    const organization = await actor.request.post("/api/auth/organization/update", {
      data: { organizationId: actor.organizationId, data: { name: actor.organizationName } },
    });
    expect(organization.ok()).toBe(true);
    const person = await actor.request.post("/api/auth/update-user", {
      data: { name: actor.name },
    });
    expect(person.ok()).toBe(true);
  }
});

test("channel readers can inspect connected organizations and grouped members", async ({
  account,
  actors,
  client,
}) => {
  const organizations = [
    { actor: account, name: "Northstar", person: "Maya Chen" },
    { actor: actors.sender, name: "Orbit Studio", person: "Alex Rivera" },
    { actor: actors.partner, name: "Fieldwork", person: "Sam Patel" },
  ];
  await Promise.all(
    organizations.map(async ({ actor, name, person }) => {
      const updated = await actor.request.post("/api/auth/organization/update", {
        data: { organizationId: actor.organizationId, data: { name } },
      });
      expect(updated.ok()).toBe(true);
      const renamed = await actor.request.post("/api/auth/update-user", {
        data: { name: person },
      });
      expect(renamed.ok()).toBe(true);
    }),
  );
  const c = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "channel",
    name: "partner-launch",
    private: true,
    emails: [actors.sender.email, actors.partner.email],
    shareHistory: true,
  });
  await acceptCollaboration(actors.sender, c.id);
  await acceptCollaboration(actors.partner, c.id);
  await post(account, "messaging/messages", {
    conversationId: c.id,
    body: "This channel brings our organizations together. Only approved participants can read and reply here.",
  });
  const host = await client(account);
  const partner = await client(actors.partner);
  await visit(partner, c.id);
  await partner.page.getByRole("button", { name: "Organizations", exact: true }).click();
  const partnerPopover = partner.page.getByRole("dialog", {
    name: "Organizations in this channel",
    exact: true,
  });
  for (const { name } of organizations) {
    await expect(partnerPopover.getByText(name, { exact: true })).toBeVisible();
  }
  await visit(host, c.id);
  const trigger = host.page.getByRole("button", {
    name: "Organizations",
    exact: true,
  });
  await trigger.click();
  const popover = host.page.getByRole("dialog", {
    name: "Organizations in this channel",
    exact: true,
  });
  await expect(popover.getByText("Your organization · 1 member", { exact: true })).toBeVisible();
  await expect(popover.getByText("Connected organization · 1 member", { exact: true })).toHaveCount(
    2,
  );
  await host.page.keyboard.press("Escape");
  await expect(popover).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await host.page.getByRole("button", { name: "Members, 3 members", exact: true }).click();
  const members = host.page.getByRole("dialog", { name: "Members", exact: true });
  for (const { name, person, actor } of organizations) {
    await expect(members.getByText(person, { exact: true })).toBeVisible();
    await expect(
      members.getByText(actor === account ? `${name} · Your organization` : name, {
        exact: true,
      }),
    ).toBeVisible();
  }
});
