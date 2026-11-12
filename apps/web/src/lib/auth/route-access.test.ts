import { QueryClient } from "@tanstack/react-query";

import { requireVerifiedSession } from "./route-access";
import * as sessionAPI from "@/api/auth/session";
import { queryKeys } from "@/queries/keys";
import { afterEach, expect, spyOn, test } from "bun:test";

let sessionSpy: ReturnType<typeof spyOn<typeof sessionAPI, "getSession">> | undefined;
afterEach(() => {
  sessionSpy?.mockRestore();
});

const session = (
  emailVerified: boolean,
): NonNullable<Awaited<ReturnType<typeof sessionAPI.getSession>>> => ({
  user: {
    id: "user",
    email: "user@example.com",
    name: "User",
    emailVerified,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "session",
    userId: "user",
    activeOrganizationId: "org",
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(),
  },
});

test("workspace navigations reuse a verified session instead of refetching it", async () => {
  const client = new QueryClient();
  sessionSpy = spyOn(sessionAPI, "getSession").mockResolvedValue(session(true));
  try {
    await requireVerifiedSession(client, "/dashboard");
    await requireVerifiedSession(client, "/tasks");
    expect((await requireVerifiedSession(client, "/notifications")).user.id).toBe("user");
    expect(sessionSpy).toHaveBeenCalledTimes(1);
    // Realtime session events invalidate the cached session; the next navigation rechecks it.
    await client.invalidateQueries({ queryKey: queryKeys.session });
    await requireVerifiedSession(client, "/dashboard");
    expect(sessionSpy).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

test("an unverified session is rechecked on each navigation, so verification elsewhere is seen", async () => {
  const client = new QueryClient();
  let verified = false;
  sessionSpy = spyOn(sessionAPI, "getSession").mockImplementation(async () => session(verified));
  try {
    const denied = await requireVerifiedSession(client, "/dashboard").catch(
      (redirect: { options: { to?: string } }) => redirect.options.to,
    );
    expect(denied).toBe("/verify-email");
    verified = true;
    expect((await requireVerifiedSession(client, "/dashboard")).user.emailVerified).toBe(true);
    expect(sessionSpy).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});
