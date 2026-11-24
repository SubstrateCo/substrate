import { googleProductScopes } from "@substrate/contracts/integrations/google";

import { setupDatabase } from "../../../../packages/database/src/testing/database";
import type { CommittedPublisher } from "../shared/committed";
import { createAuthPublisher } from "./realtime";
import { createAuth } from "./server";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const f = setupDatabase();

test("an unsupported Google grant cannot create or overwrite a server account, even alongside calendar access", async () => {
  const publish: CommittedPublisher = async (c) => c.result;
  const noMail = async () => {
    throw new Error("Unexpected email");
  };
  const auth = createAuth({
    db: f.db,
    mail: {
      resetPassword: noMail,
      verifyEmail: noMail,
      organizationInvitation: noMail,
      sharingInvitation: noMail,
    },
    publish,
    realtime: createAuthPublisher(f.db, publish),
  });
  const { internalAdapter: accounts } = await auth.$context;
  const base = {
    userId: "alice",
    providerId: "google",
    accountId: "test-google-subject",
    scope: `openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,${googleProductScopes.calendar[0]}`,
  };
  const unsupported = {
    scope: `${base.scope},https://www.googleapis.com/auth/gmail.readonly`,
    refreshToken: "synthetic-unexpected-mail-token",
  };
  await rejects(accounts.createAccount({ ...base, ...unsupported }), /unsupported permissions/);
  await rejects(
    accounts.createAccount({
      ...base,
      scope: `${base.scope},https://www.googleapis.com/auth/gmail.modify`,
    }),
    /unsupported permissions/,
  );
  expect(await accounts.findAccounts("alice")).toHaveLength(0);
  const calendar = await accounts.createAccount({
    ...base,
    refreshToken: "synthetic-calendar-token",
  });
  await rejects(
    accounts.updateAccount(calendar.id, { providerId: "google", ...unsupported }),
    /unsupported permissions/,
  );
  expect(await accounts.findAccounts("alice")).toMatchObject([
    { id: calendar.id, scope: base.scope, refreshToken: "synthetic-calendar-token" },
  ]);
});
