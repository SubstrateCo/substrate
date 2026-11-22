import { rejected, result } from "./test-support/api";
import { createCrm } from "./test-support/crm";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("interaction workspace reads enforce access and validate periods and cursors", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const contact = await createCrm(owner, {
    action: "createContact",
    displayName: "Private customer",
  });
  const interaction = await createCrm(owner, {
    action: "createInteraction",
    contactEntityId: contact.entityId,
    kind: "meeting",
    occurredAt: "2026-11-10T12:00:00.000Z",
    endedAt: "2026-11-10T12:30:00.000Z",
    summary: "Confidential pilot discussion",
  });
  const period = {
    organizationId: owner.organizationId,
    from: "2026-11-01T00:00:00.000Z",
    until: "2026-12-01T00:00:00.000Z",
    timeZone: "UTC",
  };
  const base = "/api/v1/context/interactions";
  const read = (actor: typeof owner, endpoint: string, params = period) =>
    actor.request.get(`${base}/${endpoint}`, { params });
  expect(await result(await read(owner, "activity"))).toMatchObject({
    summary: { total: 1, contacts: 1, meetingsAndCalls: 1, recordedMinutes: 30 },
  });
  expect(await result(await read(member, "activity"))).toMatchObject({
    summary: { total: 0, contacts: 0 },
    activity: [],
  });
  expect(await result(await read(member, "timeline"))).toEqual({ items: [], nextCursor: null });
  expect(await result(await read(owner, "timeline"))).toMatchObject({
    items: [
      {
        contactName: "Private customer",
        summary: "Confidential pilot discussion",
        actor: { displayName: owner.name },
      },
    ],
  });
  const directoryParams = { ...period, type: "people" };
  expect(
    await result(await owner.request.get(`${base}/directory`, { params: directoryParams })),
  ).toMatchObject({ items: [{ name: "Private customer", count: 1 }], more: false });
  expect(
    await result(await member.request.get(`${base}/directory`, { params: directoryParams })),
  ).toEqual({ items: [], more: false });
  for (const [endpoint, params] of [
    ["record", { organizationId: owner.organizationId, entityId: interaction.entityId }],
    [
      "profile",
      { organizationId: owner.organizationId, entityId: contact.entityId, type: "person" },
    ],
  ] as const) {
    expect((await owner.request.get(`${base}/${endpoint}`, { params })).ok()).toBe(true);
    await rejected(await member.request.get(`${base}/${endpoint}`, { params }), [
      "Private customer",
      "Confidential pilot discussion",
    ]);
    await rejected(await outsider.request.get(`${base}/${endpoint}`, { params }), [
      "Private customer",
      "Confidential pilot discussion",
    ]);
    expect((await anonymous.get(`${base}/${endpoint}`, { params })).status()).toBe(401);
  }
  for (const pageSize of ["0", "101", "invalid"])
    expect(
      (
        await owner.request.get(`${base}/directory`, { params: { ...directoryParams, pageSize } })
      ).status(),
    ).toBe(400);
  for (const endpoint of ["activity", "timeline"]) {
    expect((await anonymous.get(`${base}/${endpoint}`, { params: period })).status()).toBe(401);
    await rejected(await read(outsider, endpoint), [
      "Private customer",
      "Confidential pilot discussion",
    ]);
    for (const invalid of [
      { from: period.until },
      { until: "2027-01-01T00:00:00.000Z" },
      { timeZone: "Not/AZone" },
    ])
      expect((await read(owner, endpoint, { ...period, ...invalid })).status()).toBe(400);
  }
  expect(
    (
      await owner.request.get(`${base}/timeline`, {
        params: { ...period, beforeEntityId: contact.entityId },
      })
    ).status(),
  ).toBe(400);
});
