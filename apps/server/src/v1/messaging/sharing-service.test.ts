import { publicFailure } from "@substrate/contracts/result";
import { AccessDeniedError, type Committed } from "@substrate/database";

import { scopeFixture } from "../../test-support";
import { createSharingService } from "./sharing-service";
import { expect, test } from "bun:test";

test("an invite the database denies maps to not found and publishes nothing", async () => {
  const scope = scopeFixture();
  scope.repositories = {
    ...scope.repositories,
    sharing: {
      ...scope.repositories.sharing,
      invite: async () => {
        throw new AccessDeniedError();
      },
    },
  };
  const published: unknown[] = [];
  const service = createSharingService({
    publish: async <T>(committed: Committed<T>) => {
      published.push(committed);
      return committed.result;
    },
  });
  expect(
    await service.invite(scope, {
      organizationId: scope.organizationId,
      conversationId: crypto.randomUUID(),
      email: "partner@example.com",
      shareHistory: true,
    }),
  ).toEqual(publicFailure("NOT_FOUND", "Item not found or access denied."));
  expect(published).toEqual([]);
});
