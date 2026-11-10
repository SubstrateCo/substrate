import type { ServerEnvironment } from "../environment";
import nodemailer from "nodemailer";

export function createMailer(env: Pick<ServerEnvironment, "smtp" | "emailFrom">) {
  const transport = nodemailer.createTransport(env.smtp);
  return async (to: string, subject: string, text: string) => {
    await transport.sendMail({ from: env.emailFrom, to, subject, text });
  };
}
