import { desktopOrigin, desktopScheme } from "@substrate/contracts/desktop/links";

import { BlockList, isIP } from "node:net";
import { z } from "zod";

/** A bare HTTP or HTTPS origin: no wildcard, credentials, path, query or fragment. */
function explicitOrigin(value: string) {
  const url = URL.parse(value);
  if (!url || !["http:", "https:"].includes(url.protocol) || value.includes("*")) return undefined;
  const hasCredentials = url.username || url.password;
  const hasPathQueryOrFragment = url.pathname !== "/" || url.search || url.hash;
  return !hasCredentials && !hasPathQueryOrFragment && value === url.origin
    ? url.origin
    : undefined;
}
const originMessage = "Use explicit HTTP or HTTPS origins.";

const localAddresses = new BlockList();
localAddresses.addSubnet("127.0.0.0", 8, "ipv4");
localAddresses.addAddress("::1", "ipv6");
localAddresses.addAddress("0.0.0.0", "ipv4");
localAddresses.addAddress("::", "ipv6");

function productionOrigin(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = isIP(hostname);
  return (
    url.protocol === "https:" &&
    hostname !== "localhost" &&
    !hostname.endsWith(".localhost") &&
    !(family && localAddresses.check(hostname, family === 6 ? "ipv6" : "ipv4"))
  );
}

const required = () => z.string({ error: "Required." });
const origin = required().transform((value, ctx) => {
  const valid = explicitOrigin(value);
  if (valid) return valid;
  ctx.addIssue({ code: "custom", message: originMessage });
  return z.NEVER;
});
const port = z.coerce.number().int().min(1, "Use a port from 1 to 65535.").max(65535);
const httpsURL = required().refine((value) => {
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials.");

const storageKeys = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;
// Local S3 (compose.yaml) outside production. Production must name its storage.
const developmentStorage: Record<(typeof storageKeys)[number], string> = {
  S3_ENDPOINT: "http://localhost:4566",
  S3_REGION: "us-east-1",
  S3_BUCKET: "substrate-private",
  S3_ACCESS_KEY_ID: "substrate",
  S3_SECRET_ACCESS_KEY: "substrate_storage",
};

const variables = z
  .object({
    NODE_ENV: z.string().optional(),
    // The public API origin: Better Auth links, the Vite proxy target and the desktop backend.
    SUBSTRATE_API_URL: origin.default("http://localhost:3001"),
    // Bind port. Defaults to the API origin's port; set it when a proxy serves that origin.
    SERVER_PORT: port.optional(),
    // The public web app origin: email links and the first trusted frontend origin.
    SUBSTRATE_WEB_URL: origin.default("http://localhost:3000"),
    // Extra trusted frontend origins, comma separated.
    FRONTEND_ORIGINS: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const entries = value?.split(",").map((entry) => explicitOrigin(entry.trim())) ?? [];
        const valid = entries.filter((entry) => entry !== undefined);
        if (valid.length === entries.length) return valid;
        ctx.addIssue({ code: "custom", message: originMessage });
        return z.NEVER;
      }),
    BETTER_AUTH_SECRET: required().min(32, "Use at least 32 characters."),
    DATABASE_URL: required(),
    DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
    SERVER_METRICS: z
      .enum(["0", "1"])
      .default("0")
      .transform((value) => value === "1"),
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
    REALTIME_CHANNEL: z.string().default("substrate:realtime:v1"),
    SUBSTRATE_WINDOWS_DOWNLOAD_URL: httpsURL.optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
      ctx.addIssue({
        code: "custom",
        path: [env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER"],
        message: "Set SMTP_USER and SMTP_PASSWORD together.",
      });
    if (env.NODE_ENV === "production") {
      for (const key of ["SUBSTRATE_API_URL", "SUBSTRATE_WEB_URL"] as const)
        if (!productionOrigin(env[key]))
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Set an explicit HTTPS origin without localhost or loopback in production.",
          });
      if (env.FRONTEND_ORIGINS.some((value) => !productionOrigin(value)))
        ctx.addIssue({
          code: "custom",
          path: ["FRONTEND_ORIGINS"],
          message: "Use HTTPS origins without localhost or loopback in production.",
        });
      for (const key of storageKeys)
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: "Required in production." });
    }
  })
  .transform((env) => {
    const storage = (key: (typeof storageKeys)[number]) => env[key] ?? developmentStorage[key];
    const api = new URL(env.SUBSTRATE_API_URL);
    return {
      apiURL: env.SUBSTRATE_API_URL,
      port: env.SERVER_PORT ?? (Number(api.port) || (api.protocol === "https:" ? 443 : 80)),
      webURL: env.SUBSTRATE_WEB_URL,
      // The desktop scheme serves Better Auth's Electron flow; the desktop origin is the bundled renderer.
      trustedOrigins: [
        `${desktopScheme}:/`,
        ...new Set([env.SUBSTRATE_WEB_URL, desktopOrigin, ...env.FRONTEND_ORIGINS]),
      ],
      authSecret: env.BETTER_AUTH_SECRET,
      databaseURL: env.DATABASE_URL,
      databasePoolSize: env.DATABASE_POOL_SIZE,
      serverMetrics: env.SERVER_METRICS,
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
      windowsDownloadURL: env.SUBSTRATE_WINDOWS_DOWNLOAD_URL,
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
