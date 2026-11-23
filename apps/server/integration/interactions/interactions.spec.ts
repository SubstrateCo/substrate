import { rejected, result } from "../test-support/api";
import { createCrm } from "../test-support/crm";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("interaction workspace reads are organization-wide, isolated from outsiders, and validate periods and cursors", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const contact = await createCrm(owner, {
    action: "createContact",
    displayName: "Workspace customer",
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
  // Contacts and their interactions belong to the whole organization.
  for (const reader of [owner, member]) {
    expect(await result(await read(reader, "activity"))).toMatchObject({
      summary: { total: 1, contacts: 1, meetingsAndCalls: 1, recordedMinutes: 30 },
    });
    expect(await result(await read(reader, "timeline"))).toMatchObject({
      items: [
        {
          contactName: "Workspace customer",
          summary: "Confidential pilot discussion",
          actor: { displayName: owner.name },
        },
      ],
    });
  }
  const directoryParams = { ...period, type: "people" };
  for (const reader of [owner, member])
    expect(
      await result(await reader.request.get(`${base}/directory`, { params: directoryParams })),
    ).toMatchObject({ items: [{ name: "Workspace customer", count: 1 }], more: false });
  for (const [endpoint, params] of [
    ["record", { organizationId: owner.organizationId, entityId: interaction.entityId }],
    [
      "profile",
      { organizationId: owner.organizationId, entityId: contact.entityId, type: "person" },
    ],
  ] as const) {
    for (const reader of [owner, member])
      expect((await reader.request.get(`${base}/${endpoint}`, { params })).ok()).toBe(true);
    await rejected(await outsider.request.get(`${base}/${endpoint}`, { params }), [
      "Workspace customer",
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
      "Workspace customer",
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
