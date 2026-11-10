import type { MailMessage } from "./messages";
import { createMailService } from "./service";
import { expect, test } from "bun:test";

test("each mail goes to its recipient through the injected sender", async () => {
  const sent: [string, MailMessage][] = [];
  const mail = createMailService(
    async (to, message) => {
      sent.push([to, message]);
    },
    { webURL: "https://app.example.com", apiURL: "https://api.example.com" },
  );
  await mail.verifyEmail("a@example.com", "https://api.example.com/api/auth/verify-email?token=t");
  await mail.resetPassword("b@example.com", "https://api.example.com/api/auth/reset-password/t");
  await mail.organizationInvitation("c@example.com", { id: "i", organizationName: "Acme" });
  await mail.sharingInvitation("d@example.com", {
    id: crypto.randomUUID(),
    organizationName: "Acme",
    conversationName: null,
  });
  expect(sent.map(([to, message]) => [to, message.subject])).toEqual([
    ["a@example.com", "Verify your Startup OS email"],
    ["b@example.com", "Reset your Startup OS password"],
    ["c@example.com", "Join Acme on Startup OS"],
    ["d@example.com", "Collaborate with Acme on Startup OS"],
  ]);
});
