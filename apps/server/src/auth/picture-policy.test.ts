/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { AccessDeniedError } from "@startup-os/database";
import {
  authorizePictureMutation,
  protectUserPicture,
  readPictureMutation,
} from "./picture-policy";

const id = crypto.randomUUID();
const image = `/api/v1/files/${id}/content`;
test("native user and organization updates accept only canonical managed pictures or clear", () => {
  expect(protectUserPicture({ image })).toEqual({ image });
  expect(protectUserPicture({ image: null })).toEqual({ image: null });
  expect(protectUserPicture({ name: "Alice", image: undefined })).toEqual({
    name: "Alice",
    image: undefined,
  });
  expect(readPictureMutation("/update-user", { image })).toEqual({
    purpose: "avatar",
    fileId: id,
    organizationId: undefined,
  });
  expect(
    readPictureMutation("/organization/update", { data: { logo: null }, organizationId: "org" }),
  ).toEqual({ purpose: "organization-logo", fileId: null, organizationId: "org" });
  expect(readPictureMutation("/update-user", { name: "Alice" })).toBeNull();
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
});

test("native mutations derive identity from verified session and validate ready file ownership", async () => {
  const session = {
    user: { id: "alice", emailVerified: true },
    session: { activeOrganizationId: "org" },
  };
  const valid = { purpose: "avatar" as const, fileId: id, organizationId: undefined };
  const seen: string[] = [];
  const repository = {
    validatePicture: async (
      scope: { userId: string; organizationId: string | null },
      purpose: string,
      fileId: string | null,
    ) => {
      if (fileId !== id && fileId !== null) throw new AccessDeniedError();
      seen.push(`${scope.userId}:${scope.organizationId}:${purpose}:${fileId}`);
    },
  };
  await authorizePictureMutation(valid, session, repository);
  await authorizePictureMutation({ ...valid, fileId: null }, session, repository);
  expect(seen).toEqual([`alice:org:avatar:${id}`, "alice:org:avatar:null"]);
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
    authorizePictureMutation({ ...valid, fileId: crypto.randomUUID() }, session, repository),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    authorizePictureMutation(
      { ...valid, purpose: "organization-logo", organizationId: "foreign" },
      session,
      repository,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
});
