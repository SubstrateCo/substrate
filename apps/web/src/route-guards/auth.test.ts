import { QueryClient } from "@tanstack/react-query";

import { requireVerifiedSession } from "./auth";
import type { getSession } from "@/api/auth/session";
import { sessionQueryOptions } from "@/queries/auth/session";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

const session = (emailVerified: boolean): NonNullable<Awaited<ReturnType<typeof getSession>>> => ({
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

function countedSession(read: () => ReturnType<typeof session>) {
  const counter = { reads: 0 };
  const options = sessionQueryOptions(async () => {
    counter.reads++;
    return read();
  });
  return { options, counter };
}

test("workspace navigations reuse a verified session instead of refetching it", async () => {
  const client = new QueryClient();
  const { options, counter } = countedSession(() => session(true));
  try {
    await requireVerifiedSession(client, "/messages", options);
    await requireVerifiedSession(client, "/tasks", options);
    expect((await requireVerifiedSession(client, "/notifications", options)).user.id).toBe("user");
    expect(counter.reads).toBe(1);
    await client.invalidateQueries({ queryKey: queryKeys.session });
    await requireVerifiedSession(client, "/messages", options);
    expect(counter.reads).toBe(2);
  } finally {
    client.clear();
  }
});

test("an unverified session is rechecked on each navigation, so verification elsewhere is seen", async () => {
  const client = new QueryClient();
  let verified = false;
  const { options, counter } = countedSession(() => session(verified));
  try {
    const denied = await requireVerifiedSession(client, "/messages", options).catch(
      (redirect: { options: { to?: string } }) => redirect.options.to,
    );
    expect(denied).toBe("/verify-email");
    verified = true;
    expect((await requireVerifiedSession(client, "/messages", options)).user.emailVerified).toBe(
      true,
    );
    expect(counter.reads).toBe(2);
  } finally {
    client.clear();
  }
});
