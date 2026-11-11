import { AccessDeniedError } from "@substrate/database";

import {
  authorizePictureMutation,
  protectUserPicture,
  readPictureMutation,
} from "./picture-policy";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";

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
  expect(readPictureMutation("/update-user", { image })).toEqual({
    purpose: "avatar",
    url: image,
    organizationId: undefined,
  });
  expect(readPictureMutation("/update-user", { image: null })).toEqual({
    purpose: "avatar",
    url: null,
    organizationId: undefined,
  });
  expect(readPictureMutation("/organization/update", { data: { logo } })).toEqual({
    purpose: "organization-logo",
    url: logo,
    organizationId: undefined,
  });
  expect(
    readPictureMutation("/organization/update", { data: { logo: null }, organizationId: "org" }),
  ).toEqual({ purpose: "organization-logo", url: null, organizationId: "org" });
  expect(readPictureMutation("/update-user", { name: "Alice" })).toBeNull();
  expect(readPictureMutation("/organization/update", { data: { name: "Workspace" } })).toBeNull();
  for (const value of [
    "https://evil.test/a",
    `https://localhost:3001${image}`,
    `${image}?x=1`,
    "",
    "data:image/png;base64,abc",
  ]) {
    expect(() => protectUserPicture({ image: value })).toThrow();
    expect(() => readPictureMutation("/organization/update", { data: { logo: value } })).toThrow();
  }
});

test("new identities cannot inject pictures before a managed upload exists", () => {
  expect(() => protectUserPicture({ image }, true)).toThrow();
  expect(protectUserPicture({ image: null }, true)).toEqual({ image: null });
  expect(() => readPictureMutation("/sign-up/email", { image })).toThrow();
  expect(() => readPictureMutation("/organization/create", { logo: image })).toThrow();
  expect(readPictureMutation("/sign-up/email", { image: null })).toBeNull();
  expect(readPictureMutation("/organization/create", { logo: null })).toBeNull();
});

test("malformed extra fields cannot bypass managed picture authorization", () => {
  const body = { image, data: null };
  expect(() => readPictureMutation("/update-user", body)).toThrow();
  expect(readPictureMutation("/sign-in/email", body)).toBeNull();
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
  await expect(authorizePictureMutation(valid, null, repository)).rejects.toMatchObject({
    statusCode: 401,
  });
  await expect(
    authorizePictureMutation(
      valid,
      { ...session, user: { ...session.user, emailVerified: false } },
      repository,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    authorizePictureMutation(
      { ...valid, url: `/api/v1/files/pictures/avatar/bob?v=${id}` },
      session,
      repository,
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    authorizePictureMutation(
      { ...valid, purpose: "organization-logo", organizationId: "foreign" },
      session,
      repository,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  await authorizePictureMutation(
    { ...valid, purpose: "organization-logo", url: logo },
    session,
    repository,
  );
  await expect(
    authorizePictureMutation({ ...valid, purpose: "organization-logo", url: logo }, session, {
      requirePictureAccess: async () => {
        throw new AccessDeniedError();
      },
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
