import { interactionWrite } from "./interactions.ts";
import { expect, test } from "bun:test";

const interaction = {
  organizationId: "org",
  contactEntityId: crypto.randomUUID(),
  kind: "message",
  occurredAt: "2026-11-12T12:00:00Z",
  summary: "Customer confirmed the pilot scope.",
};

test("interaction summaries cannot be blank", () => {
  expect(
    interactionWrite.safeParse({ ...interaction, action: "createInteraction", summary: "  " })
      .success,
  ).toBe(false);
});

test("message publication requires explicit contact-audience consent", () => {
  const publication = {
    ...interaction,
    action: "publishInteraction",
    messageId: crypto.randomUUID(),
  };
  expect(interactionWrite.safeParse(publication).success).toBe(false);
  expect(
    interactionWrite.safeParse({ ...publication, consentToContactAudience: false }).success,
  ).toBe(false);
  expect(interactionWrite.parse({ ...publication, consentToContactAudience: true })).toMatchObject({
    consentToContactAudience: true,
    messageId: publication.messageId,
  });
});
