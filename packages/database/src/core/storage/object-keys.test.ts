import { expect, test } from "bun:test";
import { finalObjectKey, temporaryObjectKey } from "./object-keys";

const avatar = { id: "upload-1", purpose: "avatar", ownerUserId: "user-1", organizationId: null };
const logo = {
  id: "upload-2",
  purpose: "organization-logo",
  ownerUserId: null,
  organizationId: "org-1",
};
const sha256 = "a".repeat(64);

test("avatar keys identify the user and normalized picture format", () => {
  expect(temporaryObjectKey(avatar)).toBe("temporary/users/user-1/avatar/upload-1");
  expect(finalObjectKey(avatar, sha256)).toBe(
    `objects/users/user-1/avatar/upload-1/${sha256}.webp`,
  );
});

test("organization logo keys identify the organization and normalized picture format", () => {
  expect(temporaryObjectKey(logo)).toBe("temporary/organizations/org-1/organization-logo/upload-2");
  expect(finalObjectKey(logo, sha256)).toBe(
    `objects/organizations/org-1/organization-logo/upload-2/${sha256}.webp`,
  );
});

test("generic files keep arbitrary content extensionless and filenames out of keys", () => {
  const file = { ...logo, purpose: "file", filename: "private customer name.pdf" };
  expect(temporaryObjectKey(file)).toBe("temporary/organizations/org-1/file/upload-2");
  expect(finalObjectKey(file, sha256)).toBe(`objects/organizations/org-1/file/upload-2/${sha256}`);
});

test("owner and purpose segments cannot introduce extra path separators", () => {
  expect(temporaryObjectKey({ ...avatar, ownerUserId: "user/space %?#" })).toBe(
    "temporary/users/user%2Fspace%20%25%3F%23/avatar/upload-1",
  );
  expect(temporaryObjectKey({ ...logo, organizationId: "org/東京", purpose: "file/notes" })).toBe(
    "temporary/organizations/org%2F%E6%9D%B1%E4%BA%AC/file%2Fnotes/upload-2",
  );
});

test("keys require the owner for their purpose rather than falling back to another scope", () => {
  const missingUser = { ...avatar, ownerUserId: null, organizationId: "org-1" };
  const missingOrganization = { ...logo, organizationId: null, ownerUserId: "user-1" };
  for (const upload of [missingUser, missingOrganization]) {
    expect(() => temporaryObjectKey(upload)).toThrow("owner");
    expect(() => finalObjectKey(upload, sha256)).toThrow("owner");
  }
});
