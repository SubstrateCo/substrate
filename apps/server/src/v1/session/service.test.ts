import { createSessionService } from "./service";
import { sessionFixture } from "./test-support";
import { expect, test } from "bun:test";

test("session reads never expose the session token", async () => {
  const session = sessionFixture();
  const { token: _token, ...publicSession } = session.session;
  expect(await createSessionService().read({ session })).toEqual({
    success: true,
    data: { ...session, session: publicSession },
  });
});

test("anonymous session reads return null", async () => {
  expect(await createSessionService().read({ session: null })).toEqual({
    success: true,
    data: null,
  });
});
