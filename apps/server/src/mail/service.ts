import { environment, type ServerEnvironment } from "../environment";
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
export function createMailService(send: SendMail, origins: MailOrigins) {
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

function smtpSender(config: Pick<ServerEnvironment, "smtp" | "emailFrom">): SendMail {
  const transport = nodemailer.createTransport(config.smtp);
  return async (to, message) => {
    await transport.sendMail({ from: config.emailFrom, to, ...message });
  };
}

/** One SMTP transport for the process. */
export const mail = createMailService(smtpSender(environment), environment);
