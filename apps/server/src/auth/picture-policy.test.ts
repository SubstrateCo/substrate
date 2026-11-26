import { AccessDeniedError } from "@substrate/database";

import {
  authorizePictureMutation,
  protectUserPicture,
  readPictureMutation,
} from "./picture-policy";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const id = crypto.randomUUID();
const image = `/api/v1/files/pictures/avatar/alice?v=${id}`;
const logo = `/api/v1/files/pictures/organization-logo/org?v=${id}`;
test("native user and organization updates accept only canonical managed pictures or clear", () => {
  expect(protectUserPicture({ image })).toEqual({ image });
  expect(protectUserPicture({ image: null })).toEqual({ image: null });
  expect(protectUserPicture({ name: "Alice", image: undefined })).toEqual({
    name: "Alice",
    image: undefined,
  });
  expect(readPictureMutation({ path: "/update-user", body: { image } })).toEqual({
    purpose: "avatar",
    url: image,
    organizationId: undefined,
  });
  expect(readPictureMutation({ path: "/update-user", body: { image: null } })).toEqual({
    purpose: "avatar",
    url: null,
    organizationId: undefined,
  });
  expect(readPictureMutation({ path: "/organization/update", body: { data: { logo } } })).toEqual({
    purpose: "organization-logo",
    url: logo,
    organizationId: undefined,
  });
  expect(
    readPictureMutation({
      path: "/organization/update",
      body: { data: { logo: null }, organizationId: "org" },
    }),
  ).toEqual({ purpose: "organization-logo", url: null, organizationId: "org" });
  expect(readPictureMutation({ path: "/update-user", body: { name: "Alice" } })).toBeNull();
  expect(
    readPictureMutation({ path: "/organization/update", body: { data: { name: "Workspace" } } }),
  ).toBeNull();
  for (const value of [
    "https://evil.test/a",
    `https://localhost:3001${image}`,
    `${image}?x=1`,
    "",
    "data:image/png;base64,abc",
  ]) {
    expect(() => protectUserPicture({ image: value })).toThrow();
    expect(() =>
      readPictureMutation({ path: "/organization/update", body: { data: { logo: value } } }),
    ).toThrow();
  }
});

test("new identities cannot inject pictures before a managed upload exists", () => {
  expect(() => protectUserPicture({ image }, true)).toThrow();
  expect(protectUserPicture({ image: null }, true)).toEqual({ image: null });
  expect(() => readPictureMutation({ path: "/sign-up/email", body: { image } })).toThrow();
  expect(() =>
    readPictureMutation({ path: "/organization/create", body: { logo: image } }),
  ).toThrow();
  expect(readPictureMutation({ path: "/sign-up/email", body: { image: null } })).toBeNull();
  expect(readPictureMutation({ path: "/organization/create", body: { logo: null } })).toBeNull();
});

test("malformed extra fields cannot bypass managed picture authorization", () => {
  const body = { image, data: null };
  expect(() => readPictureMutation({ path: "/update-user", body })).toThrow();
  expect(readPictureMutation({ path: "/sign-in/email", body })).toBeNull();
});

test("native mutations derive identity from verified session and only accept the owner's picture path", async () => {
  const session = {
    user: { id: "alice", emailVerified: true },
    session: { activeOrganizationId: "org" },
  };
  const valid = { purpose: "avatar" as const, url: image, organizationId: undefined };
  const seen: string[] = [];
  const repository = {
    requirePictureAccess: async (
      scope: { userId: string; organizationId: string | null },
      purpose: string,
    ) => {
      seen.push(`${scope.userId}:${scope.organizationId}:${purpose}`);
    },
  };
  await authorizePictureMutation(valid, session, repository);
  await authorizePictureMutation({ ...valid, url: null }, session, repository);
  expect(seen).toEqual(["alice:org:avatar", "alice:org:avatar"]);
  await rejects(authorizePictureMutation(valid, null, repository), {
    statusCode: 401,
    body: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
  });
  await rejects(
    authorizePictureMutation(
      valid,
      { ...session, user: { ...session.user, emailVerified: false } },
      repository,
    ),
    {
      statusCode: 403,
      body: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email to continue." },
    },
  );
  await rejects(
    authorizePictureMutation(
      { ...valid, url: `/api/v1/files/pictures/avatar/bob?v=${id}` },
      session,
      repository,
    ),
    { statusCode: 400 },
  );
  await rejects(
    authorizePictureMutation(
      { ...valid, purpose: "organization-logo", organizationId: "foreign" },
      session,
      repository,
    ),
    {
      statusCode: 403,
      body: {
        code: "WORKSPACE_CHANGED",
        message: "Your active workspace changed. Reload this page to continue.",
      },
    },
  );
  await authorizePictureMutation(
    { ...valid, purpose: "organization-logo", url: logo },
    session,
    repository,
  );
  await rejects(
    authorizePictureMutation({ ...valid, purpose: "organization-logo", url: logo }, session, {
      requirePictureAccess: async () => {
        throw new AccessDeniedError();
      },
    }),
    {
      statusCode: 400,
      body: { code: "NOT_FOUND", message: "Picture not found or access denied." },
    },
  );
});
