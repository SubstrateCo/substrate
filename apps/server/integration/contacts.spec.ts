import { rejected, result } from "./test-support/api";
import { createCrm, readCrm, writeCrm } from "./test-support/crm";
import { appOrigin } from "./test-support/environment";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("Contacts owns profiles and Context owns interactions, shared with members and isolated from other organizations", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const contact = await createCrm(owner, {
    action: "createContact",
    displayName: "Private contact",
  });
  const interaction = await createCrm(owner, {
    action: "createInteraction",
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: "2026-11-12T12:00:00.000Z",
    summary: "Private call summary",
  });
  expect(
    await result(await readCrm(owner, "contact", { entityId: contact.entityId })),
  ).toMatchObject({ profile: { entityId: contact.entityId, displayName: "Private contact" } });
  expect(
    await result(await readCrm(owner, "interactions", { contactEntityId: contact.entityId })),
  ).toMatchObject([{ entityId: interaction.entityId, summary: "Private call summary" }]);
  // Every member of the organization reads and edits its contacts without a grant.
  expect(
    await result(await readCrm(member, "contact", { entityId: contact.entityId })),
  ).toMatchObject({ profile: { displayName: "Private contact" }, level: "edit" });
  await result(
    await writeCrm(member, {
      action: "updateInteraction",
      entityId: interaction.entityId,
      summary: "Corrected call summary",
    }),
  );
  expect(
    await result(await readCrm(owner, "interactions", { contactEntityId: contact.entityId })),
  ).toMatchObject([{ entityId: interaction.entityId, summary: "Corrected call summary" }]);
  await rejected(await readCrm(outsider, "contact", { entityId: contact.entityId }), [
    "Private contact",
  ]);
  await rejected(await readCrm(outsider, "interactions", { contactEntityId: contact.entityId }), [
    "Corrected call summary",
  ]);
  await rejected(
    await writeCrm(outsider, {
      action: "updateInteraction",
      entityId: interaction.entityId,
      summary: "Changed",
    }),
  );
  expect(
    (
      await anonymous.get("/api/v1/contacts/record", {
        params: { organizationId: owner.organizationId, entityId: contact.entityId },
      })
    ).status(),
  ).toBe(401);
  await rejected(
    await outsider.request.get("/api/v1/contacts/record", {
      params: { organizationId: owner.organizationId, entityId: contact.entityId },
    }),
    ["Private contact"],
  );
  expect(
    (
      await writeCrm(
        owner,
        { action: "updateContact", entityId: contact.entityId, notes: "Changed" },
        "https://untrusted.example.test",
      )
    ).status(),
  ).toBe(403);
  await result(
    await owner.request.post("/api/v1/contacts/mutations", {
      headers: { origin: appOrigin },
      data: {
        organizationId: owner.organizationId,
        action: "archive",
        entityId: contact.entityId,
        archived: true,
      },
    }),
  );
  expect(await result(await readCrm(owner, "contacts"))).toEqual([]);
  expect(await result(await readCrm(owner, "contacts", { archived: "archived" }))).toMatchObject([
    { contact: { entityId: contact.entityId } },
  ]);
  for (const path of ["contact", "contacts", "interactions", "candidates"]) {
    expect(
      (
        await owner.request.get(`/api/v1/crm/${path}`, {
          params: { organizationId: owner.organizationId },
        })
      ).status(),
    ).toBe(404);
  }
});
