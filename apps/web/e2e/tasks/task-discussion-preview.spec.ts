import { post, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("task discussion previews only the latest five root messages and opens the full conversation", async ({
  actors,
  client,
}) => {
  const actor = actors.sender;
  const created = await post<{ id: string }>(actor, "tasks/mutations", {
    action: "createProject",
    organizationId: actor.organizationId,
    name: "Launch readiness",
  });
  const target = await post<{ id: string }>(actor, "tasks/mutations", {
    action: "createTask",
    organizationId: actor.organizationId,
    projectEntityId: created.id,
    title: "Review the launch checklist",
    description: "Confirm the final checks and hand off the release to the team.",
  });
  const owner = await client(actor);
  await visit(owner, undefined, "/tasks", { projectId: created.id, taskId: target.id });
  const preview = owner.page.getByRole("region", { name: "Discussion", exact: true });
  await expect(preview.getByText("No messages yet", { exact: true })).toBeVisible();
  const { conversationId } = await post<{ conversationId: string }>(actor, "tasks/discussion", {
    organizationId: actor.organizationId,
    projectEntityId: created.id,
    taskEntityId: target.id,
  });
  const bodies = [
    "Earlier planning notes.",
    "The release checklist is ready for review.",
    "I checked the sign-in flow. Everything looks good.",
    "The updated screenshots are in the release notes.",
    "Support has the handoff notes and the rollback plan.",
    "All checks are complete. We’re ready for the final review.",
  ];
  let rootId = "";
  for (const body of bodies) {
    const message = await post<{ id: string }>(actor, "messaging/messages", {
      organizationId: actor.organizationId,
      conversationId,
      body,
    });
    rootId = message.id;
  }
  await post(actor, "messaging/messages", {
    organizationId: actor.organizationId,
    conversationId,
    threadId: rootId,
    body: "This thread reply belongs in the full conversation.",
  });
  await expect(preview.getByRole("listitem")).toHaveCount(5);
  await expect(preview.getByText(bodies[0]!, { exact: true })).toHaveCount(0);
  for (const body of bodies.slice(1))
    await expect(preview.getByText(body, { exact: true })).toBeVisible();
  await expect(
    preview.getByText("This thread reply belongs in the full conversation."),
  ).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Reply in thread", exact: true })).toHaveCount(
    0,
  );
  await expect(preview.getByRole("textbox")).toHaveCount(0);
  await preview.getByRole("link", { name: "View full conversation", exact: true }).click();
  await expect(owner.page.getByRole("textbox", { name: /^Message / })).toBeVisible();
  expect(new URL(owner.page.url()).searchParams.get("conversationId")).toBe(conversationId);
  await expect(owner.page.getByText(bodies[0]!, { exact: true })).toBeVisible();
});
