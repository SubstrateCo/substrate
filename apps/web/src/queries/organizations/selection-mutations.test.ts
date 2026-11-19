import { QueryClient } from "@tanstack/react-query";

import {
  acceptInvitationMutationOptions,
  createOrganizationMutationOptions,
} from "./selection-mutations";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

test("creating a workspace refreshes the switcher and session even when opening it fails", async () => {
  const client = new QueryClient();
  const keys = [queryKeys.organizations, queryKeys.session];
  const unrelated = queryKeys.organizationDetail("other");
  for (const key of [...keys, unrelated]) client.setQueryData(key, {});

  await createOrganizationMutationOptions(client).onSuccess();

  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  client.clear();
});

test("accepting an invitation refreshes membership and its detail without touching other invitations", async () => {
  const client = new QueryClient();
  const keys = [
    queryKeys.session,
    queryKeys.organizations,
    queryKeys.userInvitations,
    queryKeys.invitation("accepted"),
  ];
  const unrelated = queryKeys.invitation("other");
  for (const key of [...keys, unrelated]) client.setQueryData(key, {});

  await acceptInvitationMutationOptions(client, "accepted").onSuccess();

  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  client.clear();
});
