function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function authEnvironment() {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be a valid port.");
  const secure = process.env.SMTP_SECURE ?? "false";
  if (secure !== "true" && secure !== "false")
    throw new Error("SMTP_SECURE must be true or false.");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (Boolean(smtpUser) !== Boolean(smtpPassword))
    throw new Error("Set SMTP_USER and SMTP_PASSWORD together.");
  return {
    baseURL,
    secret,
    databaseURL: required("DATABASE_URL"),
    smtp: {
      host: required("SMTP_HOST"),
      port,
      secure: secure === "true",
      auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
    },
    emailFrom: required("EMAIL_FROM"),
  };
}
