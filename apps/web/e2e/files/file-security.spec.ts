import type { CompletedUpload, FilePurpose, UploadTicket } from "@startup-os/contracts/files/input";
import type { ServiceResult } from "@startup-os/contracts/result";

import { provisionVerifiedAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspaceSession } from "../test-support/organizations";
import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
const root = "/api/v1/files";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

type APIClient = { request: APIRequestContext };

const test = base.extend<{
  owner: APIClient;
  accounts: { a: APIClient; b: APIClient };
  anonymous: APIRequestContext;
}>({
  owner: async ({ request }, use) => {
    const suffix = randomUUID();
    await provisionVerifiedAccount({ request }, new Mailpit(request), {
      name: `File owner ${suffix}`,
      email: `file-owner-${suffix}@example.test`,
      password: `Files-${randomUUID()}!`,
    });
    await use({ request });
  },
  accounts: async ({ owner }, use) => {
    const request = await playwrightRequest.newContext({ baseURL: origin });
    try {
      const suffix = randomUUID();
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name: `File security ${suffix}`,
        email: `file-security-${suffix}@example.test`,
        password: `Files-${randomUUID()}!`,
      });
      await use({ a: { request }, b: owner });
    } finally {
      await request.dispose();
    }
  },
  anonymous: async ({ baseURL }, use) => {
    const context = await playwrightRequest.newContext({ baseURL: baseURL ?? origin });
    try {
      await use(context);
    } finally {
      await context.dispose();
    }
  },
});

async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), "The authorized file operation succeeds").toBe(true);
  const body: ServiceResult<T> = await response.json();
  expect(body.success, "The operation returns successful application data").toBe(true);
  if (!body.success) throw new Error("The file operation did not succeed.");
  return body.data;
}

async function rejected(response: APIResponse, privateValues: readonly string[] = []) {
  expect(response.status(), "The operation is rejected, not a server error").toBeGreaterThanOrEqual(
    400,
  );
  expect(response.status()).toBeLessThan(500);
  const text = await response.text();
  for (const value of privateValues) {
    expect(text.includes(value), "The rejection does not disclose private file data").toBe(false);
  }
  if (response.headers()["content-type"]?.includes("application/json")) {
    const body = JSON.parse(text);
    expect(body.data ?? null, "Rejected operations expose no successful resource data").toBeNull();
    expect(body.success).not.toBe(true);
  }
}

async function createUpload(
  page: APIClient,
  purpose: FilePurpose,
  filename: string,
  contentType: string,
  bytes: Buffer,
) {
  return result<UploadTicket>(
    await page.request.post(`${root}/uploads`, {
      headers: { origin },
      data: { purpose, filename, contentType, size: bytes.length },
    }),
  );
}

async function putBytes(anonymous: APIRequestContext, ticket: UploadTicket, bytes: Buffer) {
  // This context has no user cookies; signed storage requests must not carry app credentials.
  let response: APIResponse;
  try {
    response = await anonymous.put(ticket.uploadUrl, { headers: ticket.headers, data: bytes });
  } catch {
    // Do not include a credential-bearing signed URL in failure output.
    throw new Error("The signed storage upload could not be sent.");
  }
  expect(response.ok(), "The signed upload accepts the supplied bytes").toBe(true);
}

async function complete(page: APIClient, ticket: UploadTicket) {
  return page.request.post(`${root}/uploads/${ticket.uploadId}/complete`, { headers: { origin } });
}

async function image(page: APIClient) {
  const session = await result<{ user: { image?: string | null } }>(
    await page.request.get("/api/v1/session"),
  );
  return session.user.image ?? null;
}

test("file endpoints reject unauthenticated requests without exposing upload data", async ({
  anonymous,
}) => {
  const id = randomUUID();
  const responses = await Promise.all([
    anonymous.post(`${root}/uploads`, {
      headers: { origin },
      data: {
        purpose: "avatar",
        filename: "private.png",
        contentType: "image/png",
        size: png.length,
      },
    }),
    anonymous.post(`${root}/uploads/${id}/complete`, { headers: { origin } }),
    anonymous.post(`${root}/avatar`, { headers: { origin }, data: { fileId: id } }),
    anonymous.post(`${root}/organization-logo`, { headers: { origin }, data: { fileId: id } }),
    anonymous.delete(`${root}/avatar`, { headers: { origin } }),
    anonymous.delete(`${root}/organization-logo`, { headers: { origin } }),
    anonymous.delete(`${root}/${id}`, { headers: { origin } }),
    anonymous.get(`${root}/${id}/content`, { maxRedirects: 0 }),
  ]);
  for (const response of responses) {
    expect([401, 403], "Authentication is required before resource lookup").toContain(
      response.status(),
    );
    await rejected(response, ["uploadUrl", "uploadId"]);
  }
});

test("signed storage uploads enforce declared size and content type and keep objects private", async ({
  owner,
  anonymous,
}) => {
  const ticket = await createUpload(owner, "avatar", "storage-boundary.png", "image/png", png);
  const put = async (bytes: Buffer, headers: Record<string, string>) => {
    try {
      return await anonymous.put(ticket.uploadUrl, { headers, data: bytes });
    } catch {
      throw new Error("The signed storage boundary request could not be sent.");
    }
  };
  const wrongSize = await put(Buffer.concat([png, Buffer.from([0])]), ticket.headers);
  expect(
    wrongSize.status(),
    "A signed ticket rejects a different upload size",
  ).toBeGreaterThanOrEqual(400);
  expect(wrongSize.status()).toBeLessThan(500);

  const wrongTypeHeaders = Object.fromEntries(
    Object.entries(ticket.headers).filter(([name]) => name.toLowerCase() !== "content-type"),
  );
  wrongTypeHeaders["Content-Type"] = "text/plain";
  const wrongType = await put(png, wrongTypeHeaders);
  expect(
    wrongType.status(),
    "A signed ticket rejects a different content type",
  ).toBeGreaterThanOrEqual(400);
  expect(wrongType.status()).toBeLessThan(500);

  const correct = await put(png, ticket.headers);
  expect(correct.ok(), "The same ticket accepts its declared bytes and content type").toBe(true);
  const unsignedURL = new URL(ticket.uploadUrl);
  unsignedURL.search = "";
  unsignedURL.hash = "";
  let unsigned: APIResponse;
  try {
    unsigned = await anonymous.get(unsignedURL.href, { maxRedirects: 0 });
  } catch {
    throw new Error("The unsigned object privacy request could not be sent.");
  }
  expect(
    unsigned.status(),
    "Uploaded objects cannot be read without a signed request",
  ).toBeGreaterThanOrEqual(400);
  expect(unsigned.status()).toBeLessThan(500);
});

test("another user cannot complete, attach, or read a personal avatar", async ({
  accounts,
  anonymous,
}) => {
  const { a, b } = accounts;
  const filename = `private-avatar-${randomUUID()}.png`;
  const beforeA = await image(a);
  const beforeB = await image(b);
  const ticket = await createUpload(b, "avatar", filename, "image/png", png);
  await putBytes(anonymous, ticket, png);
  await rejected(await complete(a, ticket), [filename, ticket.uploadUrl]);
  const { fileId } = await result<CompletedUpload>(await complete(b, ticket));
  await rejected(
    await a.request.post(`${root}/avatar`, {
      headers: { origin },
      data: { fileId },
    }),
    [filename, ticket.uploadUrl],
  );
  await rejected(await a.request.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [filename]);
  expect(
    await image(a),
    "The failed attachment does not change the attacker's persisted profile",
  ).toBe(beforeA);
  expect(await image(b), "Completing an upload does not attach it to the owner's profile").toBe(
    beforeB,
  );

  await result(await b.request.post(`${root}/avatar`, { headers: { origin }, data: { fileId } }));
  const attached = await image(b);
  expect(attached, "The owner has a managed avatar after attachment").toBeTruthy();
  expect(attached).not.toBe(beforeB);
  const content = await b.request.get(`${root}/${fileId}/content`);
  expect(content.ok()).toBe(true);
  expect(content.headers()["content-type"]).toMatch(/^image\//);
  expect((await content.body()).length).toBeGreaterThan(0);
  await rejected(await a.request.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [filename]);
  await rejected(await anonymous.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [filename]);

  await result(await b.request.delete(`${root}/avatar`, { headers: { origin } }));
  expect(await image(b)).toBeNull();
});

test("arbitrary files download as attachments and remain private to their uploader", async ({
  accounts,
  anonymous,
}) => {
  const { a, b } = accounts;
  const suffix = randomUUID();
  await provisionWorkspaceSession(b.request, `File security ${suffix}`, `file-security-${suffix}`);
  const filename = `private-document-${randomUUID()}.txt`;
  const secret = `Uploader-only content ${randomUUID()}`;
  const bytes = Buffer.from(secret);
  const ticket = await createUpload(b, "file", filename, "text/plain", bytes);
  await putBytes(anonymous, ticket, bytes);
  const { fileId } = await result<CompletedUpload>(await complete(b, ticket));
  const response = await b.request.get(`${root}/${fileId}/content`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment(?:;|$)/i);
  expect(response.headers()["content-disposition"]).toContain(filename);
  expect(await response.body(), "Downloads preserve the uploaded arbitrary file bytes").toEqual(
    bytes,
  );
  for (const client of [a.request, anonymous]) {
    await rejected(await client.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [
      filename,
      secret,
    ]);
  }
  await rejected(await b.request.post(`${root}/avatar`, { headers: { origin }, data: { fileId } }));
  expect(await image(b), "A generic file cannot become an avatar").toBeNull();
  await rejected(await a.request.delete(`${root}/${fileId}`, { headers: { origin } }));
  await result(await b.request.delete(`${root}/${fileId}`, { headers: { origin } }));
  await rejected(await b.request.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [secret]);
});

test("workspace pictures are readable by members but cannot be managed by members or read across organizations", async ({
  accounts,
  anonymous,
}) => {
  const { a: member, b: owner } = accounts;
  const suffix = randomUUID();
  await provisionWorkspaceSession(
    owner.request,
    `Picture owners ${suffix}`,
    `picture-owners-${suffix}`,
  );
  await provisionWorkspaceSession(
    member.request,
    `Other workspace ${suffix}`,
    `other-pictures-${suffix}`,
  );
  const getOrganization = async (
    page: APIClient,
  ): Promise<{ id: string; logo?: string | null }> => {
    const response = await page.request.get("/api/auth/organization/get-full-organization");
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const organization = await getOrganization(owner);
  const otherOrganization = await getOrganization(member);
  const memberSession = await result<{ user: { email: string } }>(
    await member.request.get("/api/v1/session"),
  );
  const invitation = await owner.request.post("/api/auth/organization/invite-member", {
    headers: { origin },
    data: { organizationId: organization.id, email: memberSession.user.email, role: "member" },
  });
  expect(invitation.ok()).toBe(true);
  const { id: invitationId }: { id: string } = await invitation.json();
  const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
    headers: { origin },
    data: { invitationId },
  });
  expect(accepted.ok()).toBe(true);
  const activated = await member.request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId: organization.id },
  });
  expect(activated.ok()).toBe(true);

  const logoName = `workspace-logo-${suffix}.png`;
  const avatarName = `coworker-avatar-${suffix}.png`;
  const logoTicket = await createUpload(owner, "organization-logo", logoName, "image/png", png);
  const avatarTicket = await createUpload(owner, "avatar", avatarName, "image/png", png);
  await putBytes(anonymous, logoTicket, png);
  await putBytes(anonymous, avatarTicket, png);
  const logo = await result<CompletedUpload>(await complete(owner, logoTicket));
  const avatar = await result<CompletedUpload>(await complete(owner, avatarTicket));
  for (const file of [logo, avatar]) {
    await rejected(
      await member.request.get(`${root}/${file.fileId}/content`, { maxRedirects: 0 }),
      [logoName, avatarName],
    );
  }
  await result(
    await owner.request.post(`${root}/organization-logo`, {
      headers: { origin },
      data: { fileId: logo.fileId },
    }),
  );
  await result(
    await owner.request.post(`${root}/avatar`, {
      headers: { origin },
      data: { fileId: avatar.fileId },
    }),
  );
  const attachedLogo = (await getOrganization(owner)).logo;
  const attachedAvatar = await image(owner);
  expect(attachedLogo).toBeTruthy();
  expect(attachedAvatar).toBeTruthy();
  for (const file of [logo, avatar]) {
    const content = await member.request.get(`${root}/${file.fileId}/content`);
    expect(content.ok(), "Coworkers can read attached workspace pictures").toBe(true);
    expect(content.headers()["content-type"]).toMatch(/^image\//);
    expect((await content.body()).length).toBeGreaterThan(0);
  }

  await rejected(
    await member.request.post(`${root}/uploads`, {
      headers: { origin },
      data: {
        purpose: "organization-logo",
        filename: "member-logo.png",
        contentType: "image/png",
        size: png.length,
      },
    }),
  );
  await rejected(
    await member.request.post(`${root}/organization-logo`, {
      headers: { origin },
      data: { fileId: logo.fileId },
    }),
  );
  await rejected(await member.request.delete(`${root}/organization-logo`, { headers: { origin } }));
  await rejected(await member.request.delete(`${root}/${logo.fileId}`, { headers: { origin } }));
  await rejected(
    await member.request.post(`${root}/avatar`, {
      headers: { origin },
      data: { fileId: avatar.fileId },
    }),
  );
  expect(
    (await getOrganization(owner)).logo,
    "Denied member mutations preserve the workspace logo",
  ).toBe(attachedLogo);
  expect(await image(owner), "Coworker visibility does not permit avatar reassignment").toBe(
    attachedAvatar,
  );

  const switched = await member.request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId: otherOrganization.id },
  });
  expect(switched.ok()).toBe(true);
  for (const file of [logo, avatar]) {
    await rejected(
      await member.request.get(`${root}/${file.fileId}/content`, { maxRedirects: 0 }),
      [logoName, avatarName],
    );
  }
});

test("an image MIME declaration cannot make non-image bytes a completed avatar", async ({
  owner,
  anonymous,
}) => {
  const before = await image(owner);
  const bytes = Buffer.from(`<html>Not an image ${randomUUID()}</html>`);
  const ticket = await createUpload(owner, "avatar", "spoofed.png", "image/png", bytes);
  await putBytes(anonymous, ticket, bytes);
  await rejected(await complete(owner, ticket), [ticket.uploadUrl]);
  expect(await image(owner), "Rejected content leaves the persisted profile unchanged").toBe(
    before,
  );
});

for (const purpose of ["avatar", "organization-logo"] as const) {
  test(`native picture updates attach and clear a managed ${purpose} atomically`, async ({
    owner,
    anonymous,
  }) => {
    let organizationId: string | undefined;
    if (purpose === "organization-logo") {
      const suffix = randomUUID();
      const created = await owner.request.post("/api/auth/organization/create", {
        headers: { origin },
        data: { name: `Native pictures ${suffix}`, slug: `native-pictures-${suffix}` },
      });
      expect(created.ok()).toBe(true);
      const organization: { id: string } = await created.json();
      organizationId = organization.id;
      const activated = await owner.request.post("/api/auth/organization/set-active", {
        headers: { origin },
        data: { organizationId },
      });
      expect(activated.ok()).toBe(true);
    }

    const ticket = await createUpload(owner, purpose, `native-${purpose}.png`, "image/png", png);
    await putBytes(anonymous, ticket, png);
    const { fileId } = await result<CompletedUpload>(await complete(owner, ticket));
    const managedURL = `${root}/${fileId}/content`;
    const update = (value: string | null) =>
      owner.request.post(
        purpose === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
        {
          headers: { origin },
          data: purpose === "avatar" ? { image: value } : { organizationId, data: { logo: value } },
        },
      );
    const persistedPicture = async () => {
      if (purpose === "avatar") {
        const response = await owner.request.get("/api/auth/get-session", {
          params: { disableCookieCache: "true" },
        });
        expect(response.ok()).toBe(true);
        const session: { user: { image?: string | null } } = await response.json();
        const freshImage = await image(owner);
        expect(
          freshImage,
          "Native and application session reads agree on the persisted avatar",
        ).toBe(session.user.image ?? null);
        return freshImage;
      }
      const response = await owner.request.get("/api/auth/organization/get-full-organization", {
        params: { organizationId: organizationId! },
      });
      expect(response.ok()).toBe(true);
      const organization: { logo?: string | null } = await response.json();
      return organization.logo ?? null;
    };

    const attached = await update(managedURL);
    expect(
      attached.ok(),
      "Native Better Auth updates accept an owned, completed managed picture",
    ).toBe(true);
    expect(await persistedPicture()).toBe(managedURL);
    const content = await owner.request.get(managedURL);
    expect(content.ok()).toBe(true);
    expect(content.headers()["content-type"]).toMatch(/^image\//);
    expect((await content.body()).length).toBeGreaterThan(0);

    await rejected(await owner.request.delete(`${root}/${fileId}`, { headers: { origin } }));
    expect(
      await persistedPicture(),
      "Rejected deletion preserves the native picture attachment",
    ).toBe(managedURL);
    expect(
      (await owner.request.get(managedURL)).ok(),
      "The protected attached file remains readable",
    ).toBe(true);

    const cleared = await update(null);
    expect(cleared.ok(), "Native Better Auth updates can clear a managed picture").toBe(true);
    expect(await persistedPicture()).toBeNull();
    await result(await owner.request.delete(`${root}/${fileId}`, { headers: { origin } }));
    await rejected(await owner.request.get(managedURL, { maxRedirects: 0 }));
    expect(
      await persistedPicture(),
      "Deleting the detached file does not restore a stale picture URL",
    ).toBeNull();
  });
}

test("Better Auth organization creation cannot persist an unmanaged logo", async ({ owner }) => {
  const suffix = randomUUID();
  const slug = `unmanaged-logo-${suffix}`;
  const created = await owner.request.post("/api/auth/organization/create", {
    headers: { origin },
    data: {
      name: `Unmanaged logo ${suffix}`,
      slug,
      logo: `https://example.test/unmanaged-${suffix}.png`,
    },
  });
  if (!created.ok()) await rejected(created);

  const listed = await owner.request.get("/api/auth/organization/list");
  expect(listed.ok()).toBe(true);
  const organizations: { id: string; slug: string; logo?: string | null }[] = await listed.json();
  const organization = organizations.find((candidate) => candidate.slug === slug);
  if (!created.ok()) {
    expect(organization, "Rejected creation leaves no persisted organization").toBeUndefined();
  } else {
    expect(
      organization,
      "Accepted creation persists the organization without the supplied logo",
    ).toBeDefined();
    const fetched = await owner.request.get("/api/auth/organization/get-full-organization", {
      params: { organizationId: organization!.id },
    });
    expect(fetched.ok()).toBe(true);
    const persisted: { logo?: string | null } = await fetched.json();
    expect(persisted.logo ?? null, "Native creation cannot persist an unmanaged logo").toBeNull();
  }
});

test("Better Auth profile and organization updates cannot bypass managed picture attachments", async ({
  owner,
}) => {
  const external = `https://example.test/unmanaged-${randomUUID()}.png`;
  const before = await image(owner);
  // A server may reject the field or ignore it, but must never persist the supplied URL.
  const updatedUser = await owner.request.post("/api/auth/update-user", {
    headers: { origin },
    data: { image: external },
  });
  expect(updatedUser.status()).toBeLessThan(500);
  expect(await image(owner), "Native profile updates cannot persist an unmanaged image").toBe(
    before,
  );

  const suffix = randomUUID();
  const created = await owner.request.post("/api/auth/organization/create", {
    headers: { origin },
    data: { name: `File security ${suffix}`, slug: `file-security-${suffix}` },
  });
  expect(created.ok()).toBe(true);
  const organization: { id: string; logo?: string | null } = await created.json();
  const activated = await owner.request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId: organization.id },
  });
  expect(activated.ok()).toBe(true);
  const updatedOrganization = await owner.request.post("/api/auth/organization/update", {
    headers: { origin },
    data: { organizationId: organization.id, data: { logo: external } },
  });
  expect(updatedOrganization.status()).toBeLessThan(500);
  const fetched = await owner.request.get("/api/auth/organization/get-full-organization", {
    params: { organizationId: organization.id },
  });
  expect(fetched.ok()).toBe(true);
  const persisted: { logo?: string | null } = await fetched.json();
  expect(
    persisted.logo ?? null,
    "Native organization updates cannot persist an unmanaged logo",
  ).toBe(organization.logo ?? null);
});
