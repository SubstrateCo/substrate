import nodemailer from "nodemailer";
import type { authEnvironment } from "./environment";

export function createMailer(env: ReturnType<typeof authEnvironment>) {
  const transport = nodemailer.createTransport(env.smtp);
  return async (to: string, subject: string, text: string) => {
    await transport.sendMail({ from: env.emailFrom, to, subject, text });
  };
}
