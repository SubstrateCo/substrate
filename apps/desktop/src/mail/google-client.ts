import { ReconnectRequired } from "./provider.ts";
import { open } from "node:fs/promises";
import { z } from "zod";

const clientSchema = z.object({
  client_id: z.string().min(1).max(512),
  client_secret: z.string().min(1).max(2048).optional(),
});
export type GoogleClient = z.output<typeof clientSchema>;
const download = z.object({
  installed: clientSchema.extend({
    client_id: z.string().max(512).endsWith(".apps.googleusercontent.com"),
  }),
});
const storedGrant = z.object({
  version: z.literal(1),
  client: clientSchema,
  refreshToken: z.string().min(1),
});

export function environmentGoogleClient(): GoogleClient | undefined {
  const client_id = process.env.SUBSTRATE_GMAIL_CLIENT_ID;
  if (!client_id) return undefined;
  return { client_id, client_secret: process.env.SUBSTRATE_GMAIL_CLIENT_SECRET || undefined };
}

/** New consent may use a new client. Existing refresh tokens are always bound to their issuer. */
export function clientForConsent(
  chooseFile: boolean,
  configured: GoogleClient | undefined,
  saved: () => GoogleClient | undefined,
  pick: () => Promise<GoogleClient | null>,
) {
  return chooseFile ? pick() : (configured ?? saved() ?? pick());
}

/** Only Electron's native chooser supplies this path. Never report filenames, JSON, or parse errors. */
export async function readGoogleClientFile(path: string): Promise<GoogleClient> {
  try {
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 64 * 1024) throw new Error();
      // Strip all other fields. Endpoints and scopes come from Substrate, not the download.
      return download.parse(JSON.parse(await file.readFile("utf8"))).installed;
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("Choose the downloaded JSON for a Google Desktop app OAuth client.");
  }
}

/** Kept inside the existing OS-encrypted grant. Refresh must use the client that issued the token. */
export function packGoogleGrant(client: GoogleClient, refreshToken: string) {
  return JSON.stringify({ version: 1, client: clientSchema.parse(client), refreshToken });
}

export function unpackGoogleGrant(value: string) {
  // Previous installs encrypted just the opaque refresh token and supplied the client through env.
  if (!value.startsWith("{") && value.length) return { client: undefined, refreshToken: value };
  try {
    return storedGrant.parse(JSON.parse(value));
  } catch {
    throw new ReconnectRequired("Reconnect Gmail.");
  }
}
