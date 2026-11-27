import { gmailAccess } from "../google/google-auth.ts";
import {
  environmentGoogleClient,
  packGoogleGrant,
  unpackGoogleGrant,
  type GoogleClient,
} from "../google/google-client.ts";
import { ReconnectRequired } from "../provider.ts";
import type { LocalMail } from "../session.ts";
import { gmailReader } from "./gmail-reader.ts";
import { safeStorage } from "electron";

export function checkKeyring() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error("A system credential store is required for Gmail.");
}
export function sealGrant(client: GoogleClient, refreshToken: string) {
  return safeStorage.encryptString(packGoogleGrant(client, refreshToken)).toString("base64");
}
export function openGrant(sealed: string) {
  return unpackGoogleGrant(safeStorage.decryptString(Buffer.from(sealed, "base64")));
}
export async function withGmail<T>(
  local: LocalMail,
  id: string,
  signal: AbortSignal,
  work: (reader: ReturnType<typeof gmailReader>, grant: () => string) => Promise<T>,
  background = false,
) {
  const c = await local.db.connection(id);
  if (!c) throw new Error("Mailbox unavailable.");
  signal.throwIfAborted();
  let sealed = c.protectedGrant;
  try {
    checkKeyring();
    if (c.provider !== "gmail") throw new Error("Provider unavailable.");
    const grant = openGrant(sealed);
    const client = grant.client ?? environmentGoogleClient();
    if (!client) throw new ReconnectRequired("Reconnect Gmail.");
    const access = gmailAccess(
      client,
      grant.refreshToken,
      signal,
      async (replacement) => {
        const next = sealGrant(client, replacement);
        await local.db.rotateGrant(id, sealed, next);
        sealed = next;
      },
      fetch,
      () => local.db.disableWrites(id, sealed),
    );
    return await work(gmailReader(access, signal), () => sealed);
  } catch (error) {
    if (!signal.aborted && (background || error instanceof ReconnectRequired))
      await local.db.fail(id, sealed, error instanceof ReconnectRequired ? "reconnect" : "retry");
    throw error;
  }
}
export type GmailWork = typeof withGmail;
