import { password, userOf } from "./lib/data.ts";
import { call, setOrganization } from "./lib/http.ts";
import type { ContextRow, Message } from "./lib/world.ts";
import { check, fail } from "k6";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ["rate==1"], api_failures: ["count==0"] },
};

export default async function () {
  const user = userOf(__VU);
  if (!(await call("auth.signIn", { email: user.email, password }))) fail("Sign-in failed");
  setOrganization(user.organizationId);
  await call("auth.setActive", { organizationId: user.organizationId });
  const project = await call<{ id: string }>("tasks.mutations", {
    action: "createProject",
    name: `Discussion smoke ${crypto.randomUUID()}`,
  });
  if (!project) fail("Smoke project creation failed");
  const task = await call<{ id: string }>("tasks.mutations", {
    action: "createTask",
    projectEntityId: project.id,
    title: "Verify task discussion",
  });
  if (!task) fail("Smoke task creation failed");
  const target = { projectEntityId: project.id, taskEntityId: task.id };
  const first = await call<{ conversationId: string }>("tasks.discussion", target);
  const again = await call<{ conversationId: string }>("tasks.discussion", target);
  check(first, {
    "resolving a task reuses its discussion": (value) =>
      !!value?.conversationId && value.conversationId === again?.conversationId,
  });
  if (!first) fail("Discussion resolution failed");
  const sent = await call<Message>("messaging.messages.send", {
    conversationId: first.conversationId,
    body: `Load smoke: @[task:${task.id}]`,
    requestId: crypto.randomUUID(),
  });
  if (!sent) fail("Discussion send failed");
  const rows = await call<Message[]>("messaging.messages", {
    conversationId: first.conversationId,
  });
  check(rows, {
    "discussion history contains the sent message": (value) =>
      !!value?.some((row) => row.id === sent.id && row.body === sent.body),
  });
  const context = await call<ContextRow[]>("context.messagePage", { messageIds: [sent.id] });
  check(context, {
    "discussion messages retain structured task references": (value) =>
      !!value?.[0]?.links.some((link) => link.entityId === task.id),
  });
  const related = await call<{ messageId: string }[]>("context.related", {
    entityId: task.id,
  });
  check(related, {
    "task backlinks include the discussion message": (value) =>
      !!value?.some((row) => row.messageId === sent.id),
  });
  await call("tasks.mutations", { action: "deleteProject", projectEntityId: project.id });
  await call("auth.signOut");
}
