import { appOrigin } from "./test-support/environment";
import { image, rejected, result, uploadPicture, type APIClient } from "./test-support/files";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = appOrigin;
test("another user cannot attach or read a personal avatar", async ({
  actors: { outsider: a, owner: b },
  request: anonymous,
}) => {
  const beforeA = await image(a);
  const beforeB = await image(b);
  const { url } = await result<{ url: string }>(await uploadPicture(b, "avatar"));
  await rejected(
    await a.request.post("/api/auth/update-user", {
      headers: { origin },
      data: { image: url },
    }),
  );
  await rejected(await a.request.get(url, { maxRedirects: 0 }));
  expect(
    await image(a),
    "The failed attachment does not change the attacker's persisted profile",
  ).toBe(beforeA);
  expect(await image(b), "Completing an upload does not attach it to the owner's profile").toBe(
    beforeB,
  );

  expect(
    (
      await b.request.post("/api/auth/update-user", { headers: { origin }, data: { image: url } })
    ).ok(),
  ).toBe(true);
  const attached = await image(b);
  expect(attached, "The owner has a managed avatar after attachment").toBeTruthy();
  expect(attached).not.toBe(beforeB);
  const content = await b.request.get(url);
  expect(content.ok()).toBe(true);
  expect(content.headers()["content-type"]).toMatch(/^image\//);
  expect((await content.body()).length).toBeGreaterThan(0);
  await rejected(await a.request.get(url, { maxRedirects: 0 }));
  await rejected(await anonymous.get(url, { maxRedirects: 0 }));

  expect(
    (
      await b.request.post("/api/auth/update-user", { headers: { origin }, data: { image: null } })
    ).ok(),
  ).toBe(true);
  expect(await image(b)).toBeNull();
});

test("workspace pictures are readable by members but cannot be managed by members or read across organizations", async ({
  actors: { owner, member },
  workspace,
}) => {
  const getOrganization = async (
    page: APIClient,
  ): Promise<{ id: string; logo?: string | null }> => {
    const response = await page.request.get("/api/auth/organization/get-full-organization");
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const organization = await getOrganization(owner);
  const logo = await result<{ url: string }>(await uploadPicture(owner, "organization-logo"));
  const avatar = await result<{ url: string }>(await uploadPicture(owner, "avatar"));
  expect(
    (
      await owner.request.post("/api/auth/organization/update", {
        headers: { origin },
        data: { organizationId: organization.id, data: { logo: logo.url } },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await owner.request.post("/api/auth/update-user", {
        headers: { origin },
        data: { image: avatar.url },
      })
    ).ok(),
  ).toBe(true);
  const attachedLogo = (await getOrganization(owner)).logo;
  const attachedAvatar = await image(owner);
  expect(attachedLogo).toBeTruthy();
  expect(attachedAvatar).toBeTruthy();
  for (const file of [logo, avatar]) {
    const content = await member.request.get(file.url);
    expect(content.ok(), "Coworkers can read attached workspace pictures").toBe(true);
    expect(content.headers()["content-type"]).toMatch(/^image\//);
    expect((await content.body()).length).toBeGreaterThan(0);
  }

  await rejected(await uploadPicture(member, "organization-logo"));
  await rejected(
    await member.request.post("/api/auth/organization/update", {
      headers: { origin },
      data: { organizationId: organization.id, data: { logo: logo.url } },
    }),
  );
  await rejected(
    await member.request.post("/api/auth/organization/update", {
      headers: { origin },
      data: { organizationId: organization.id, data: { logo: null } },
    }),
  );
  await rejected(
    await member.request.post("/api/auth/update-user", {
      headers: { origin },
      data: { image: avatar.url },
    }),
  );
  expect(
    (await getOrganization(owner)).logo,
    "Denied member mutations preserve the workspace logo",
  ).toBe(attachedLogo);
  expect(await image(owner), "Coworker visibility does not permit avatar reassignment").toBe(
    attachedAvatar,
  );

  // The member's session moves to another workspace, so the pictures are no longer coworkers'.
  await workspace(member);
  for (const file of [logo, avatar]) {
    await rejected(await member.request.get(file.url, { maxRedirects: 0 }));
  }

  // The shared owner keeps no picture for later tests.
  for (const [path, data] of [
    ["/api/auth/update-user", { image: null }],
    ["/api/auth/organization/update", { organizationId: organization.id, data: { logo: null } }],
  ] as const)
    expect((await owner.request.post(path, { headers: { origin }, data })).ok()).toBe(true);
  expect(await image(owner)).toBeNull();
  expect((await getOrganization(owner)).logo ?? null).toBeNull();
});

for (const purpose of ["avatar", "organization-logo"] as const) {
  test(`native picture updates save and clear an uploaded ${purpose}`, async ({
    actors,
    workspace,
  }) => {
    // A logo belongs to the active workspace, so the logo case writes a fresh one.
    const [owner] =
      purpose === "organization-logo" ? await workspace(actors.owner) : [actors.owner];
    const organizationId = purpose === "organization-logo" ? owner.organizationId : undefined;

    const { url: managedURL } = await result<{ url: string }>(await uploadPicture(owner, purpose));
    const update = (value: string | null) =>
      owner.request.post(
        purpose === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
        {
          headers: { origin },
          data: purpose === "avatar" ? { image: value } : { organizationId, data: { logo: value } },
        },
      );
    const persistedPicture = async () => {
      if (purpose === "avatar") return image(owner);
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

    const replacement = await result<{ url: string }>(await uploadPicture(owner, purpose));
    expect(replacement.url.split("?")[0]).toBe(managedURL.split("?")[0]);
    expect(replacement.url).not.toBe(managedURL);
    expect(await persistedPicture(), "Uploading does not write Better Auth").toBe(managedURL);
    expect((await update(replacement.url)).ok()).toBe(true);
    expect(await persistedPicture()).toBe(replacement.url);

    const cleared = await update(null);
    expect(cleared.ok(), "Native Better Auth updates can clear a managed picture").toBe(true);
    expect(await persistedPicture()).toBeNull();
  });
}

test("native profile and organization writes reject unmanaged picture URLs without persisting them", async ({
  actors: { owner },
}) => {
  const external = `https://example.test/unmanaged-${randomUUID()}.png`;
  const suffix = randomUUID();
  const slug = `unmanaged-logo-${suffix}`;
  const created = await owner.request.post("/api/auth/organization/create", {
    headers: { origin },
    data: { name: `Unmanaged logo ${suffix}`, slug, logo: external },
  });
  expect(created.status(), "Creation rejects a logo before any upload exists").toBe(400);
  const listed = await owner.request.get("/api/auth/organization/list");
  expect(listed.ok()).toBe(true);
  const organizations: { slug: string }[] = await listed.json();
  expect(
    organizations.some((candidate) => candidate.slug === slug),
    "Rejected creation leaves no persisted organization",
  ).toBe(false);

  const before = await image(owner);
  const updatedUser = await owner.request.post("/api/auth/update-user", {
    headers: { origin },
    data: { image: external },
  });
  expect(updatedUser.status()).toBe(400);
  expect(await image(owner), "Native profile updates cannot persist an unmanaged image").toBe(
    before,
  );

  const logo = async () => {
    const fetched = await owner.request.get("/api/auth/organization/get-full-organization", {
      params: { organizationId: owner.organizationId },
    });
    expect(fetched.ok()).toBe(true);
    const organization: { logo?: string | null } = await fetched.json();
    return organization.logo ?? null;
  };
  const logoBefore = await logo();
  const updatedOrganization = await owner.request.post("/api/auth/organization/update", {
    headers: { origin },
    data: { organizationId: owner.organizationId, data: { logo: external } },
  });
  expect(updatedOrganization.status()).toBe(400);
  expect(await logo(), "Native organization updates cannot persist an unmanaged logo").toBe(
    logoBefore,
  );
});
