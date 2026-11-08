import { desktopScheme } from "@startup-os/contracts/desktop/links";

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function explicitOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Frontend origins must be explicit HTTP or HTTPS origins.");
  }
  const isWebProtocol = ["http:", "https:"].includes(url.protocol);
  const hasCredentials = url.username || url.password;
  const hasPathQueryOrFragment = url.pathname !== "/" || url.search || url.hash;
  const isBareOrigin = !hasCredentials && !hasPathQueryOrFragment && value === url.origin;
  if (!isWebProtocol || value.includes("*") || !isBareOrigin)
    throw new Error("Frontend origins must be explicit HTTP or HTTPS origins.");
  return url.origin;
}

export function authEnvironment(env: Environment = process.env) {
  const baseURL = env.BETTER_AUTH_URL ?? "http://localhost:3001";
  const frontendURL = explicitOrigin(env.APP_URL ?? "http://localhost:3000");
  const trustedOrigins = [
    `${desktopScheme}:/`,
    ...new Set(
      (env.FRONTEND_ORIGINS === undefined
        ? [frontendURL, "https://desktop.startup-os.local"]
        : env.FRONTEND_ORIGINS.split(",").map((origin) => origin.trim())
      ).map(explicitOrigin),
    ),
  ];
  const secret = required(env, "BETTER_AUTH_SECRET");
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  const port = Number(env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be a valid port.");
  const secure = env.SMTP_SECURE ?? "false";
  if (secure !== "true" && secure !== "false")
    throw new Error("SMTP_SECURE must be true or false.");
  const smtpUser = env.SMTP_USER;
  const smtpPassword = env.SMTP_PASSWORD;
  if (Boolean(smtpUser) !== Boolean(smtpPassword))
    throw new Error("Set SMTP_USER and SMTP_PASSWORD together.");
  return {
    baseURL,
    frontendURL,
    trustedOrigins,
    secret,
    databaseURL: required(env, "DATABASE_URL"),
    smtp: {
      host: required(env, "SMTP_HOST"),
      port,
      secure: secure === "true",
      auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
    },
    emailFrom: required(env, "EMAIL_FROM"),
  };
}
