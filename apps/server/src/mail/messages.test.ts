import {
  organizationInvitationMessage,
  resetPasswordMessage,
  sharingInvitationMessage,
  verifyEmailMessage,
} from "./messages";
import { expect, test } from "bun:test";

const origins = { webURL: "https://app.example.com", apiURL: "https://api.example.com" };
const linkIn = (text: string) => new URL(text.match(/https:\/\/\S+/)![0]);

test("verification and reset mails open Better Auth's link on the web app", () => {
  const verify = verifyEmailMessage(
    "https://api.example.com/api/auth/verify-email?token=verification-token",
    origins,
  );
  expect(verify.subject).toBe("Verify your Substrate email");
  expect(linkIn(verify.text).toString()).toBe(
    "https://app.example.com/api/auth/verify-email?token=verification-token",
  );
  const reset = resetPasswordMessage(
    "https://api.example.com/api/auth/reset-password/reset-token",
    origins,
  );
  expect(reset.subject).toBe("Reset your Substrate password");
  expect(linkIn(reset.text).toString()).toBe(
    "https://app.example.com/api/auth/reset-password/reset-token",
  );
});

test("an organization invitation names the organization and links to its acceptance page", () => {
  const message = organizationInvitationMessage(
    { id: "invite-1", organizationName: "Acme" },
    origins,
  );
  expect(message.subject).toBe("Join Acme on Substrate");
  expect(linkIn(message.text).toString()).toBe(
    "https://app.example.com/accept-invitation/invite-1",
  );
});

test("a sharing invitation sends the recipient through the desktop handoff on the API", () => {
  const id = crypto.randomUUID();
  const message = sharingInvitationMessage(
    { id, organizationName: "Acme", conversationName: "launch" },
    origins,
  );
  expect(message.subject).toBe("Collaborate with Acme on Substrate");
  expect(message.text).toContain("You have been invited to launch.");
  const link = linkIn(message.text);
  expect(link.origin).toBe(origins.apiURL);
  expect(link.pathname).toBe("/desktop/open");
  expect(link.searchParams.get("path")).toBe(`/accept-sharing/${id}`);
  expect(
    sharingInvitationMessage({ id, organizationName: "Acme", conversationName: null }, origins)
      .text,
  ).toContain("You have been invited to a conversation.");
});
