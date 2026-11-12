import { environment } from "../environment";
import {
  organizationInvitationMessage,
  resetPasswordMessage,
  sharingInvitationMessage,
  verifyEmailMessage,
  type MailMessage,
  type MailOrigins,
} from "./messages";
import nodemailer from "nodemailer";

export type SendMail = (to: string, message: MailMessage) => Promise<void>;

/** Every email the server sends. Tests pass their own send function instead of SMTP. */
function createMailService(send: SendMail, origins: MailOrigins) {
  return {
    verifyEmail: (to: string, url: string) => send(to, verifyEmailMessage(url, origins)),
    resetPassword: (to: string, url: string) => send(to, resetPasswordMessage(url, origins)),
    organizationInvitation: (
      to: string,
      invitation: { id: string; organizationName: string },
      request?: Request,
    ) => send(to, organizationInvitationMessage(invitation, origins, request)),
    sharingInvitation: (
      to: string,
      invitation: { id: string; organizationName: string; conversationName: string | null },
    ) => send(to, sharingInvitationMessage(invitation, origins)),
  };
}

export type MailService = ReturnType<typeof createMailService>;

export function createSmtpMail() {
  const transport = nodemailer.createTransport({ ...environment.smtp, pool: true });
  const send: SendMail = async (to, message) => {
    await transport.sendMail({ from: environment.emailFrom, to, ...message });
  };
  return { mail: createMailService(send, environment), close: () => transport.close() };
}
