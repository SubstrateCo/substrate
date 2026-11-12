import { messageRecordInput } from "./crm-from-message-input";
import { expect, test } from "bun:test";

test("message creation keeps the stable request identity outside strict domain fields", () => {
  const input = messageRecordInput("message", "stable-request", {
    action: "createAccount",
    organizationId: "workspace",
    requestId: "editor-request",
    name: "Reviewed business",
    website: null,
    domain: null,
    summary: "Reviewed summary",
  });
  expect(input).toEqual({
    organizationId: "workspace",
    messageId: "message",
    requestId: "stable-request",
    consentToRecordAudience: true,
    associate: false,
    kind: "account",
    fields: { name: "Reviewed business", website: null, domain: null, summary: "Reviewed summary" },
  });
});

test("a contact from a message uses entered contact fields without inferred actor or email identity", () => {
  const input = messageRecordInput("message", "request", {
    action: "createContact",
    organizationId: "workspace",
    displayName: "Reviewed person",
    notes: null,
  });
  expect(input.kind).toBe("contact");
  expect(input.fields).toEqual({ displayName: "Reviewed person", notes: null });
});

test("a deal from a message retains the chosen stage, customer and currency fields", () => {
  const accountEntityId = crypto.randomUUID();
  const stageId = crypto.randomUUID();
  const input = messageRecordInput("message", "request", {
    action: "createDeal",
    organizationId: "workspace",
    requestId: "editor-request",
    title: "Reviewed pursuit",
    accountEntityId,
    stageId,
    contactEntityIds: [],
    primaryContactEntityId: null,
    amount: "0",
    currency: "USD",
    summary: "",
    expectedCloseDate: null,
  });
  expect(input.fields).toEqual({
    title: "Reviewed pursuit",
    accountEntityId,
    stageId,
    contactEntityIds: [],
    primaryContactEntityId: null,
    amount: "0",
    currency: "USD",
    summary: "",
    expectedCloseDate: null,
  });
});
