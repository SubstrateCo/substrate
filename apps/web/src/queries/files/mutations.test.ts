import { MutationObserver, QueryClient } from "@tanstack/react-query";

import { pictureMutationOptions } from "./mutations";
import { testPictureApi } from "@/api/files/pictures.test-support";
import { queryKeys } from "@/queries/keys";
import { afterEach, expect, spyOn, test } from "bun:test";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
});

test("agent pictures refresh only their owner's catalog", async () => {
  const client = new QueryClient();
  const owner = queryKeys.agents("owner");
  const untouched = [
    queryKeys.agents("other"),
    queryKeys.session,
    queryKeys.projects("organization"),
  ];
  for (const key of [owner, ...untouched]) client.setQueryData(key, { image: "old" });
  try {
    await pictureMutationOptions(client, {
      kind: "agent",
      userId: "owner",
      agentId: "agent",
    }).refresh();
    expect(client.getQueryState(owner)?.isInvalidated).toBe(true);
    for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});

test("project pictures refresh their detail and workspace catalog, not other project details", async () => {
  const client = new QueryClient();
  const affected = [
    queryKeys.project("organization", "project"),
    queryKeys.projects("organization"),
  ];
  const untouched = [
    queryKeys.project("organization", "other-project"),
    queryKeys.project("other-organization", "project"),
    queryKeys.projects("other-organization"),
    queryKeys.session,
    queryKeys.agents("owner"),
  ];
  for (const key of [...affected, ...untouched]) client.setQueryData(key, { image: "old" });
  try {
    await pictureMutationOptions(client, {
      kind: "project",
      organizationId: "organization",
      projectEntityId: "project",
    }).refresh();
    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});

for (const kind of ["avatar", "organization-logo"] as const) {
  for (const action of ["upload", "remove"] as const) {
    test(`${kind} ${action} refreshes affected pictures when a commit response is lost`, async () => {
      const queryClient = new QueryClient();
      const sessionKey = queryKeys.session;
      const organizationKey = queryKeys.organizationDetail("active");
      const otherOrganizationKey = queryKeys.organizationDetail("other");
      for (const key of [
        sessionKey,
        organizationKey,
        otherOrganizationKey,
        queryKeys.organizations,
        queryKeys.projects("active"),
        queryKeys.conversations("active"),
        queryKeys.invitations("active"),
      ]) {
        queryClient.setQueryData(key, { picture: "old" });
      }
      const lost = async (): Promise<never> => {
        throw new Error("Commit response lost");
      };
      const options = pictureMutationOptions(
        queryClient,
        kind === "avatar" ? { kind } : { kind, organizationId: "active" },
        { uploadPicture: lost, removePicture: lost },
      );
      const mutation =
        action === "upload"
          ? new MutationObserver(queryClient, options.upload).mutate({
              file: new File(["image"], "image.png", { type: "image/png" }),
            })
          : new MutationObserver(queryClient, options.remove).mutate();
      await mutation.then(
        () => {
          throw new Error("Expected an uncertain commit result");
        },
        (error: Error) => {
          expect(error.message).toBe("Commit response lost");
        },
      );
      expect(queryClient.getQueryState(sessionKey)?.isInvalidated).toBe(kind === "avatar");
      expect(queryClient.getQueryState(organizationKey)?.isInvalidated).toBe(
        kind === "organization-logo",
      );
      expect(queryClient.getQueryState(queryKeys.organizations)?.isInvalidated).toBe(
        kind === "organization-logo",
      );
      expect(queryClient.getQueryState(otherOrganizationKey)?.isInvalidated).toBe(false);
      // Logos appear only in organization detail and the organization list.
      for (const key of [
        queryKeys.projects("active"),
        queryKeys.conversations("active"),
        queryKeys.invitations("active"),
      ])
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
      queryClient.clear();
    });
  }
}

for (const action of ["upload", "remove"] as const) {
  test(`logo ${action} sends the captured organization scope so a switched session cannot target another workspace`, async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.organizationDetail("organization-a"), { logo: "old-a" });
    queryClient.setQueryData(queryKeys.organizationDetail("organization-b"), { logo: "old-b" });
    const options = pictureMutationOptions(
      queryClient,
      { kind: "organization-logo", organizationId: "organization-a" },
      testPictureApi,
    );
    fetchSpy = spyOn(globalThis, "fetch");
    if (action === "upload") {
      fetchSpy.mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { url: "/api/v1/files/pictures/organization-logo/organization-a?v=one" },
        }),
      );
    }
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { code: "FORBIDDEN", message: "Active organization changed." },
        { status: 403 },
      ),
    );
    const mutation =
      action === "upload"
        ? new MutationObserver(queryClient, options.upload).mutate({
            file: new File(["image"], "image.png", { type: "image/png" }),
          })
        : new MutationObserver(queryClient, options.remove).mutate();
    await mutation.then(
      () => {
        throw new Error("Expected the changed-session guard to reject the mutation");
      },
      (error: Error) => {
        expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
      },
    );
    const [, commit] = fetchSpy.mock.calls.at(-1)!;
    expect(await new Response(commit?.body).json()).toEqual({
      organizationId: "organization-a",
      data: {
        logo:
          action === "upload"
            ? "/api/v1/files/pictures/organization-logo/organization-a?v=one"
            : null,
      },
    });
    if (action === "upload") {
      const body = fetchSpy.mock.calls[0]?.[1]?.body;
      if (!(body instanceof FormData)) throw new Error("Expected multipart upload.");
      expect(body.get("organizationId")).toBe("organization-a");
    }
    expect(
      queryClient.getQueryState(queryKeys.organizationDetail("organization-a"))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(queryKeys.organizationDetail("organization-b"))?.isInvalidated,
    ).toBe(false);
    queryClient.clear();
  });
}
