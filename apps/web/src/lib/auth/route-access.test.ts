import { QueryClient } from "@tanstack/react-query";

import { requireVerifiedSession } from "./route-access";
import { queryKeys } from "@/queries/keys";
import { afterEach, expect, spyOn, test } from "bun:test";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
});

const session = (emailVerified: boolean) => ({
  user: { id: "user", email: "user@example.com", emailVerified },
  session: { activeOrganizationId: "org" },
});

test("workspace navigations reuse a verified session instead of refetching it", async () => {
  const client = new QueryClient();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({ success: true, data: session(true) }), {
      preconnect: globalThis.fetch.preconnect,
    }),
  );
  try {
    await requireVerifiedSession(client, "/dashboard");
    await requireVerifiedSession(client, "/tasks");
    expect((await requireVerifiedSession(client, "/notifications")).user.id).toBe("user");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Realtime session events invalidate the cached session; the next navigation rechecks it.
    await client.invalidateQueries({ queryKey: queryKeys.session });
    await requireVerifiedSession(client, "/dashboard");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

test("an unverified session is rechecked on each navigation, so verification elsewhere is seen", async () => {
  const client = new QueryClient();
  let verified = false;
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({ success: true, data: session(verified) }), {
      preconnect: globalThis.fetch.preconnect,
    }),
  );
  try {
    const denied = await requireVerifiedSession(client, "/dashboard").catch(
      (redirect: { options: { to?: string } }) => redirect.options.to,
    );
    expect(denied).toBe("/verify-email");
    verified = true;
    expect((await requireVerifiedSession(client, "/dashboard")).user.emailVerified).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});
