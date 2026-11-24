import { desktopHandoffURL } from "@substrate/contracts/desktop/links";

import { frontendAuthLink, invitationLink } from "./links";
import { renderTransactionalEmail } from "./transactional-email";

/** Where links in emails point: the public web app and the public API. */
export interface MailOrigins {
  webURL: string;
  apiURL: string;
}

export interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

// Better Auth builds its URLs on the API; the browser flow opens them on the web app.
export async function verifyEmailMessage(url: string, origins: MailOrigins): Promise<MailMessage> {
  return {
    subject: "Verify your Substrate email",
    ...(await renderTransactionalEmail({
      preview: "Confirm your email address to get started with Substrate.",
      category: "Your account",
      title: "Verify your email.",
      description:
        "Verify your email address to finish setting up your Substrate account. Your workspace is one step away.",
      action: "Verify email address",
      url: frontendAuthLink(url, origins.webURL),
      notice: "If you didn’t create a Substrate account, you can safely ignore this email.",
    })),
  };
}

export async function resetPasswordMessage(
  url: string,
  origins: MailOrigins,
): Promise<MailMessage> {
  return {
    subject: "Reset your Substrate password",
    ...(await renderTransactionalEmail({
      preview: "Choose a new password for your Substrate account.",
      category: "Account security",
      title: "Reset your password.",
      description:
        "We received a request to reset your Substrate password. Use the button below to choose a new one.",
      action: "Reset password",
      url: frontendAuthLink(url, origins.webURL),
      notice:
        "Didn’t request this? You can ignore this email. Your password won’t change unless you set a new one.",
    })),
  };
}

/** A request from the desktop renderer gets the desktop handoff instead of a web link. */
export async function organizationInvitationMessage(
  invitation: { id: string; organizationName: string },
  origins: MailOrigins,
  request?: Request,
): Promise<MailMessage> {
  const url = invitationLink(invitation.id, origins.webURL, { baseURL: origins.apiURL, request });
  return {
    subject: `Join ${invitation.organizationName} on Substrate`,
    ...(await renderTransactionalEmail({
      preview: "Your team has invited you to join their workspace on Substrate.",
      category: "Workspace invitation",
      title: "Good work starts together.",
      description:
        "You’ve been invited to a workspace on Substrate. Join your team and keep your conversations, projects, and work in one place.",
      context: { label: "Your new workspace", name: invitation.organizationName },
      action: "Accept invitation",
      url,
      notice:
        "Not expecting this invitation? You can ignore this email. You won’t join the workspace unless you accept.",
    })),
  };
}

export async function sharingInvitationMessage(
  invitation: { id: string; organizationName: string; conversationName: string | null },
  origins: MailOrigins,
): Promise<MailMessage> {
  const link = desktopHandoffURL(`/accept-sharing/${invitation.id}`, origins.apiURL);
  return {
    subject: `Collaborate with ${invitation.organizationName} on Substrate`,
    ...(await renderTransactionalEmail({
      preview: "Review an invitation to a shared conversation on Substrate.",
      category: "Conversation invitation",
      title: "Bring your teams together.",
      description: `${invitation.organizationName} has invited you to collaborate in a shared conversation on Substrate.`,
      context: {
        label: "Shared conversation",
        name: invitation.conversationName ?? "A conversation",
        detail: "Accepting shares the full conversation history.",
      },
      action: "Review invitation",
      url: link,
      next: "You can accept or decline the invitation. New to Substrate? You can create an account and organization before installing the app.",
      notice:
        "Nothing is shared until you accept. If you weren’t expecting this invitation, you can ignore this email.",
    })),
  };
}
