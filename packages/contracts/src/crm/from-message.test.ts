import { crmFromMessage } from "./from-message";
import { expect, test } from "bun:test";

const input = {
  organizationId: "org-a",
  messageId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  kind: "account",
  fields: { name: " Reviewed company " },
  consentToRecordAudience: true,
};

test("requires explicit audience consent and rejects unreviewed fields or actor identity", () => {
  expect(crmFromMessage.safeParse({ ...input, consentToRecordAudience: false }).success).toBe(
    false,
  );
  expect(crmFromMessage.safeParse({ ...input, consentToRecordAudience: undefined }).success).toBe(
    false,
  );
  expect(crmFromMessage.safeParse({ ...input, actorEntityId: crypto.randomUUID() }).success).toBe(
    false,
  );
  expect(
    crmFromMessage.safeParse({ ...input, fields: { name: "Company", body: "private" } }).success,
  ).toBe(false);
  expect(crmFromMessage.parse(input)).toMatchObject({
    associate: false,
    fields: { name: "Reviewed company", summary: "", website: null, domain: null },
  });
});

test("uses canonical contact and deal fields without inventing identity or commercial facts", () => {
  expect(
    crmFromMessage.parse({ ...input, kind: "contact", fields: { displayName: "Buyer" } }).fields,
  ).toEqual({ displayName: "Buyer" });
  expect(
    crmFromMessage.safeParse({ ...input, kind: "deal", fields: { title: "Sale" } }).success,
  ).toBe(false);
});
