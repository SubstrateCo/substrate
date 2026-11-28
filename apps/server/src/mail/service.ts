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

function createMailService(send: SendMail, origins: MailOrigins) {
  return {
    verifyEmail: async (to: string, url: string) =>
      send(to, await verifyEmailMessage(url, origins)),
    resetPassword: async (to: string, url: string) =>
      send(to, await resetPasswordMessage(url, origins)),
    organizationInvitation: async (
      to: string,
      invitation: { id: string; organizationName: string },
      request?: Request,
    ) => send(to, await organizationInvitationMessage(invitation, origins, request)),
    sharingInvitation: async (
      to: string,
      invitation: { id: string; organizationName: string; conversationName: string | null },
    ) => send(to, await sharingInvitationMessage(invitation, origins)),
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
