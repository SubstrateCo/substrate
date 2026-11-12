import { failure, publicFailure } from "@substrate/contracts/result";

import { sessionFixture } from "../../auth/test-support";
import { createTestScopes, createTestServices } from "../../test-support";
import { createSharingRoutes } from "./sharing-routes";
import { expect, mock, test } from "bun:test";

test("sharing validates every route before resolving scope or calling services", async () => {
  const services = createTestServices().sharing;
  const spies = {
    getInvitation: mock(services.getInvitation),
    acceptInvitation: mock(services.acceptInvitation),
    declineInvitation: mock(services.declineInvitation),
    invite: mock(services.invite),
    revoke: mock(services.revoke),
    resend: mock(services.resend),
    disconnect: mock(services.disconnect),
    remove: mock(services.remove),
    list: mock(services.list),
    conversations: mock(services.conversations),
    inbox: mock(services.inbox),
  };
  const app = createSharingRoutes(spies, createTestScopes());
  for (const [method, path] of [
    ["GET", "/invitation"],
    ["POST", "/accept"],
    ["POST", "/decline"],
    ["POST", "/invite"],
    ["POST", "/revoke"],
    ["POST", "/resend"],
    ["POST", "/disconnect"],
    ["POST", "/remove"],
    ["GET", "/details"],
    ["GET", "/conversations"],
    ["GET", "/inbox"],
  ] as const) {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
});

test("sharing decline needs only the verified owner, not an active workspace", async () => {
  const services = createTestServices().sharing;
  const declineInvitation = mock(async () => failure("CONFLICT", "Invitation already used."));
  const scopes = createTestScopes({
    api: {
      getSession: async () => sessionFixture({ organizationId: null }),
      getActiveMemberRole: async () => {
        throw new Error("Owner operations must not check an active workspace.");
      },
    },
  });
  const app = createSharingRoutes({ ...services, declineInvitation }, scopes);
  const invitationId = crypto.randomUUID();
  const response = await app.request("/decline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invitationId }),
  });
  expect(response.status).toBe(409);
  expect(declineInvitation).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: null, owner: expect.any(Object) }),
    { invitationId },
  );
});
