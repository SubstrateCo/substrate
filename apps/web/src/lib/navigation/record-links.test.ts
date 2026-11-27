import {
  calendarLink,
  contactLink,
  interactionLink,
  interactionPersonLink,
  linkedWorkLink,
  messageLink,
  personLink,
  workLink,
} from "./record-links";
import { expect, test } from "bun:test";
test("linked work opens a task in its project and a project by itself", () => {
  const project = { projectEntityId: "project", entityId: "project" };
  expect(
    linkedWorkLink("team", { ...project, entityType: "task", entityId: "task" }, true),
  ).toEqual(workLink("team", "project", "task"));
  expect(linkedWorkLink("team", { ...project, entityType: "project" }, true)).toEqual(
    workLink("team", "project"),
  );
});
test("links preserve workspace and exact task or message targets", () => {
  expect(workLink("team", "project", "task")).toEqual({
    to: "/tasks",
    search: { workspaceId: "team", projectId: "project", taskId: "task" },
  });
  expect(messageLink("team", "conversation", "reply")).toEqual({
    to: "/messages",
    search: { workspaceId: "team", conversationId: "conversation", messageId: "reply" },
  });
});
test("a conversation opened from a CRM record keeps that record", () => {
  expect(
    messageLink("team", "conversation", undefined, { type: "deal", entityId: "renewal" }).search,
  ).toMatchObject({ conversationId: "conversation", sourceType: "deal", sourceId: "renewal" });
});
test("a person opens in Contacts only when CRM is on", () => {
  expect(personLink("team", "maya", true)).toEqual(contactLink("team", "maya"));
  // All time, so the profile shows the linked record's interactions however old they are.
  expect(personLink("team", "maya", false)).toEqual({
    to: "/interactions",
    search: { workspaceId: "team", section: "person", profileId: "maya", days: "all" },
  });
});
test("linked people and interactions follow the CRM choice", () => {
  const none = { projectEntityId: null };
  expect(
    linkedWorkLink("team", { ...none, entityType: "contact", entityId: "maya" }, false),
  ).toEqual(interactionPersonLink("team", "maya"));
  const call = { ...none, entityType: "contact_interaction" as const, entityId: "call" };
  expect(linkedWorkLink("team", { ...call, contactEntityId: "maya" }, false)).toEqual(
    interactionPersonLink("team", "maya"),
  );
  expect(linkedWorkLink("team", { ...call, contactEntityId: "maya" }, true)).toEqual(
    contactLink("team", "maya"),
  );
  expect(linkedWorkLink("team", call, true)).toEqual(interactionLink("team", "call"));
});
test("a linked meeting opens in the calendar, on its day when known", () => {
  const meeting = { projectEntityId: null, entityType: "calendar_event" as const, entityId: "m" };
  expect(linkedWorkLink("team", { ...meeting, date: "2026-09-28" }, false)).toEqual(
    calendarLink("team", "m", "2026-09-28"),
  );
  expect(linkedWorkLink("team", meeting, false)).toEqual({
    to: "/calendar",
    search: { workspaceId: "team", eventId: "m", date: undefined },
  });
});
