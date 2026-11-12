import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("the workspace summary and people are only for the organization's members", async ({
  actors: { owner, member, outsider },
  request,
}) => {
  const params = { organizationId: owner.organizationId };
  const current = async (actor: typeof owner) => {
    const response = await actor.request.get("/api/v1/organizations/current", { params });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  expect(await current(owner)).toMatchObject({ id: owner.organizationId, role: "owner" });
  expect(await current(member)).toMatchObject({ id: owner.organizationId, role: "member" });

  const people = await member.request.get("/api/v1/organizations/people", { params });
  expect(people.ok()).toBe(true);
  const emails = (await people.json()).data.map((person: { email: string }) => person.email);
  expect(emails).toEqual(expect.arrayContaining([owner.email, member.email]));
  expect(emails).not.toContain(outsider.email);

  for (const path of ["current", "people"]) {
    const url = `/api/v1/organizations/${path}`;
    expect((await outsider.request.get(url, { params })).status()).toBe(403);
    expect((await request.get(url, { params })).status()).toBe(401);
  }
});
