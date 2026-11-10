import { desktopHandoffURL } from "../desktop/service";
import { frontendAuthLink, invitationLink } from "./links";

/** Where links in emails point: the public web app and the public API. */
export interface MailOrigins {
  webURL: string;
  apiURL: string;
}

export interface MailMessage {
  subject: string;
  text: string;
}

// Better Auth builds its URLs on the API; the browser flow opens them on the web app.
export function verifyEmailMessage(url: string, origins: MailOrigins): MailMessage {
  return {
    subject: "Verify your Startup OS email",
    text: `Verify your email address: ${frontendAuthLink(url, origins.webURL)}`,
  };
}

export function resetPasswordMessage(url: string, origins: MailOrigins): MailMessage {
  return {
    subject: "Reset your Startup OS password",
    text: `Reset your password: ${frontendAuthLink(url, origins.webURL)}`,
  };
}

/** A request from the desktop renderer gets the desktop handoff instead of a web link. */
export function organizationInvitationMessage(
  invitation: { id: string; organizationName: string },
  origins: MailOrigins,
  request?: Request,
): MailMessage {
  const url = invitationLink(invitation.id, origins.webURL, { baseURL: origins.apiURL, request });
  return {
    subject: `Join ${invitation.organizationName} on Startup OS`,
    text: `Accept your invitation: ${url}`,
  };
}

export function sharingInvitationMessage(
  invitation: { id: string; organizationName: string; conversationName: string | null },
  origins: MailOrigins,
): MailMessage {
  const link = desktopHandoffURL(`/accept-sharing/${invitation.id}`, origins.apiURL);
  return {
    subject: `Collaborate with ${invitation.organizationName} on Startup OS`,
    text: `You have been invited to ${invitation.conversationName ?? "a conversation"}.\n\nAccept or decline:\n${link}\n\nAccepting shares the full conversation history. You can create an account and organization before installing the app.`,
  };
}
