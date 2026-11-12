import { crmFromMessage } from "@substrate/contracts/crm/from-message";
import { failure, success } from "@substrate/contracts/result";

import { createTestScopes } from "../../test-support";
import { createCrmFromMessageRoutes } from "./from-message-routes";
import { expect, mock, test } from "bun:test";

const input = {
  organizationId: "org",
  messageId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  consentToRecordAudience: true,
  kind: "account",
  fields: { name: "Company" },
};
function post(body: string) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  };
}

test("from-message route rejects missing consent, untrusted actor identity, and invalid fields", async () => {
  const create = mock(async () => failure("NOT_FOUND", "Item not found or access denied."));
  const app = createCrmFromMessageRoutes({ create }, createTestScopes());
  for (const body of [
    { ...input, consentToRecordAudience: undefined },
    { ...input, consentToRecordAudience: false },
    { ...input, actorEntityId: crypto.randomUUID() },
    { ...input, messageId: "invalid" },
    { ...input, fields: { name: "", summary: "private" } },
  ])
    expect((await app.request("/from-message", post(JSON.stringify(body)))).status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});

test("from-message route uses workspace scope and returns only the created identity", async () => {
  const result = { entityId: crypto.randomUUID(), entityType: "account" as const };
  const create = mock(async () => success(result));
  const app = createCrmFromMessageRoutes({ create }, createTestScopes());
  const response = await app.request("/from-message", post(JSON.stringify(input)));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success(result));
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    crmFromMessage.parse(input),
  );
});

test("changed request identity maps conflict without disclosing source metadata", async () => {
  const result = failure("CONFLICT", "Request identity was reused with different input.");
  const app = createCrmFromMessageRoutes({ create: async () => result }, createTestScopes());
  const response = await app.request("/from-message", post(JSON.stringify(input)));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(result);
});
