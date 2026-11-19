import { MutationObserver, QueryClient } from "@tanstack/react-query";

import {
  acceptInvitationMutationOptions,
  createOrganizationMutationOptions,
  organizationActivationOptions,
} from "./selection-mutations";
import { registerUnsavedDraft } from "@/lib/navigation/unsaved-drafts";
import { queryKeys } from "@/queries/keys";
import { expect, mock, test } from "bun:test";

test("activation keeps the current workspace and cache when the user keeps editing", async () => {
  const client = new QueryClient();
  const draft = mock(() => Promise.resolve(false));
  const unregister = registerUnsavedDraft(draft, "Project");
  try {
    client.setQueryData(queryKeys.session, { activeOrganizationId: "current" });
    const options = organizationActivationOptions();
    const switcher = new MutationObserver(client, options.switchTo(null));
    const sharing = new MutationObserver(client, options.openLinked);
    expect(await switcher.mutate("target")).toBe(false);
    expect(await sharing.mutate({ organizationId: "target", destination: "/setup/complete" })).toBe(
      false,
    );
    expect(draft).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(queryKeys.session)).toEqual({ activeOrganizationId: "current" });
    expect(client.getQueryState(queryKeys.session)?.isInvalidated).toBe(false);
  } finally {
    unregister();
    client.clear();
  }
});

test("workspace activation forwards the destination bound by the caller or supplied with the target", async () => {
  const client = new QueryClient();
  const activate = mock((_organizationId: string, _destination?: string | null) =>
    Promise.resolve(true),
  );
  try {
    const options = organizationActivationOptions(activate);
    const switcher = new MutationObserver(client, options.switchTo(null));
    const sharing = new MutationObserver(client, options.openLinked);
    expect(await switcher.mutate("switcher-target")).toBe(true);
    expect(
      await sharing.mutate({ organizationId: "sharing-target", destination: "/setup/complete" }),
    ).toBe(true);
    expect(activate.mock.calls).toEqual([
      ["switcher-target", null],
      ["sharing-target", "/setup/complete"],
    ]);
  } finally {
    client.clear();
  }
});

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
