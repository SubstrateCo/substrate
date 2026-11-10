import { desktopOrigin, desktopScheme } from "@startup-os/contracts/desktop/links";

import { z } from "zod";

/** A bare HTTP or HTTPS origin: no wildcard, credentials, path, query or fragment. */
export function explicitOrigin(value: string) {
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

const required = () => z.string({ error: "Required." });
const origin = required().transform((value, ctx) => {
  try {
    return explicitOrigin(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});
const port = z.coerce.number().int().min(1, "Use a port from 1 to 65535.").max(65535);
const httpsURL = required().refine((value) => {
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials.");

// Local S3 (compose.yaml) outside production. Production must name its storage.
const developmentStorage = {
  S3_ENDPOINT: "http://localhost:4566",
  S3_REGION: "us-east-1",
  S3_BUCKET: "startup-os-private",
  S3_ACCESS_KEY_ID: "startup_os",
  S3_SECRET_ACCESS_KEY: "startup_os_storage",
};
const storageKeys = Object.keys(developmentStorage) as (keyof typeof developmentStorage)[];

const variables = z
  .object({
    NODE_ENV: z.string().optional(),
    // The public API origin: Better Auth links, the Vite proxy target and the desktop backend.
    STARTUP_OS_API_URL: origin.default("http://localhost:3001"),
    // Bind port. Defaults to the API origin's port; set it when a proxy serves that origin.
    SERVER_PORT: port.optional(),
    // The public web app origin: email links and the first trusted frontend origin.
    STARTUP_OS_WEB_URL: origin.default("http://localhost:3000"),
    // Extra trusted frontend origins, comma separated.
    FRONTEND_ORIGINS: z
      .string()
      .optional()
      .transform((value, ctx) => {
        try {
          return value?.split(",").map((entry) => explicitOrigin(entry.trim())) ?? [];
        } catch (error) {
          ctx.addIssue({ code: "custom", message: (error as Error).message });
          return z.NEVER;
        }
      }),
    BETTER_AUTH_SECRET: required().min(32, "Use at least 32 characters."),
    DATABASE_URL: required(),
    SMTP_HOST: required(),
    SMTP_PORT: port.default(587),
    SMTP_SECURE: z
      .enum(["true", "false"], { error: "Use true or false." })
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: required(),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    VALKEY_URL: z.string().default("redis://localhost:6379"),
    // Separates servers that share one Valkey, such as the e2e and development servers.
    REALTIME_CHANNEL: z.string().default("startup-os:realtime:v1"),
    STARTUP_OS_WINDOWS_DOWNLOAD_URL: httpsURL.optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
      ctx.addIssue({
        code: "custom",
        path: [env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER"],
        message: "Set SMTP_USER and SMTP_PASSWORD together.",
      });
    if (env.NODE_ENV === "production")
      for (const key of storageKeys)
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: "Required in production." });
  })
  .transform((env) => {
    const storage = (key: keyof typeof developmentStorage) => env[key] ?? developmentStorage[key];
    const api = new URL(env.STARTUP_OS_API_URL);
    return {
      apiURL: env.STARTUP_OS_API_URL,
      port: env.SERVER_PORT ?? (Number(api.port) || (api.protocol === "https:" ? 443 : 80)),
      webURL: env.STARTUP_OS_WEB_URL,
      // The desktop scheme serves Better Auth's Electron flow; the desktop origin is the bundled renderer.
      trustedOrigins: [
        `${desktopScheme}:/`,
        ...new Set([env.STARTUP_OS_WEB_URL, desktopOrigin, ...env.FRONTEND_ORIGINS]),
      ],
      authSecret: env.BETTER_AUTH_SECRET,
      databaseURL: env.DATABASE_URL,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth:
          env.SMTP_USER && env.SMTP_PASSWORD
            ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
            : undefined,
      },
      emailFrom: env.EMAIL_FROM,
      storage: {
        endpoint: storage("S3_ENDPOINT"),
        region: storage("S3_REGION"),
        bucket: storage("S3_BUCKET"),
        accessKeyId: storage("S3_ACCESS_KEY_ID"),
        secretAccessKey: storage("S3_SECRET_ACCESS_KEY"),
      },
      valkeyURL: env.VALKEY_URL,
      realtimeChannel: env.REALTIME_CHANNEL,
      windowsDownloadURL: env.STARTUP_OS_WINDOWS_DOWNLOAD_URL,
    };
  });

export type ServerEnvironment = z.output<typeof variables>;

/** Empty values count as unset. Throws one error that lists every invalid variable. */
export function parseServerEnvironment(env: Record<string, string | undefined>) {
  const result = variables.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== "")),
  );
  if (!result.success)
    throw new Error(
      `Invalid server environment:\n${result.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  return result.data;
}

/** Parsed once, when the server first imports this module. */
export const environment = parseServerEnvironment(process.env);
