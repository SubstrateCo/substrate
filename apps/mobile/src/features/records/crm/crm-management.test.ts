import {
  messageRecordInput,
  ownerAssignment,
  personName,
  publicationSources,
  recordPeople,
} from "./crm-management";
import { expect, test } from "bun:test";

const organizationId = "org";
const messageId = "6c0b7b2e-6b7f-4c47-9b35-1f6d8a1f1c01";
const requestId = "6c0b7b2e-6b7f-4c47-9b35-1f6d8a1f1c02";
const stageId = "6c0b7b2e-6b7f-4c47-9b35-1f6d8a1f1c03";

test("record people join humans to members by user ID, never by email or actor ID", () => {
  const members = [
    { userId: "user-two", name: "Two", email: "same@example.com" },
    { userId: "user-one", name: "One", email: "same@example.com" },
  ];
  expect(
    recordPeople(
      [
        { entityId: "actor-two", userId: "user-two", type: "human" },
        { entityId: "actor-one", userId: "user-one", type: "human" },
        { entityId: "agent", userId: "user-one", type: "agent" },
        { entityId: "former", userId: "departed", type: "human" },
        { entityId: "user-one", userId: null, type: "human" },
      ],
      members,
    ),
  ).toEqual([
    { id: "actor-one", name: "One", email: "same@example.com" },
    { id: "actor-two", name: "Two", email: "same@example.com" },
  ]);
});

test("an actor without a current member shows as a former member, not as an ID", () => {
  expect(personName([{ id: "actor-one", name: "One", email: "" }], "actor-gone")).toBe(
    "Former member",
  );
});

test("owner reassignment guards on the owner seen, and on the version only for deals", () => {
  const account = ownerAssignment(
    organizationId,
    { kind: "account", entityId: "account", ownerActorEntityId: "old" },
    "new",
    "require_existing_access",
  );
  expect(account).toEqual({
    action: "assignOwner",
    organizationId,
    entityId: "account",
    ownerActorEntityId: "new",
    expectedOwnerActorEntityId: "old",
    accessDecision: "require_existing_access",
  });
  const deal = ownerAssignment(
    organizationId,
    { kind: "deal", entityId: "deal", ownerActorEntityId: "old", version: 7 },
    "new",
    "keep_restricted",
  );
  expect(deal.expectedVersion).toBe(7);
  expect(deal.accessDecision).toBe("keep_restricted");
});

test("publication sources drop deleted messages and repeated references", () => {
  const rows = [
    { messageId: "a", deletedAt: null, purpose: "mention" },
    { messageId: "a", deletedAt: null, purpose: "source" },
    { messageId: "b", deletedAt: "2026-11-01T00:00:00.000Z", purpose: "mention" },
    { messageId: "c", deletedAt: null, purpose: "discussion" },
  ];
  expect(publicationSources(rows).map((row) => [row.messageId, row.purpose])).toEqual([
    ["a", "mention"],
    ["c", "discussion"],
  ]);
});

test("a record from a message records consent and sends only the kind's own fields", () => {
  const formState = { title: "Renewal", stageId, extra: "form state" };
  const input = messageRecordInput(
    organizationId,
    messageId,
    requestId,
    { kind: "deal", fields: formState },
    true,
  );
  expect(input).toMatchObject({
    organizationId,
    messageId,
    requestId,
    kind: "deal",
    consentToRecordAudience: true,
    associate: false,
  });
  expect(input.fields).not.toHaveProperty("extra");
  expect(input.fields).toMatchObject({ title: "Renewal", stageId });
});
