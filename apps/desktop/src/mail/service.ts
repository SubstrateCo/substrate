import { handleBridge } from "@substrate/contracts/desktop/ipc";
import { channel, methods } from "@substrate/contracts/mail/ipc";

import { gmailReader, syncFailureKind } from "./gmail-reader.ts";
import { connectGoogle, gmailAccess } from "./google-auth.ts";
import { pickGoogleClient } from "./google-client-picker.ts";
import {
  clientForConsent,
  environmentGoogleClient,
  packGoogleGrant,
  unpackGoogleGrant,
  type GoogleClient,
} from "./google-client.ts";
import { nextMailPage, readOlderSource } from "./older-page.ts";
import { readMailPicture, referencedPicture } from "./pictures.ts";
import { ReconnectRequired, syncMailbox } from "./provider.ts";
import { createMailSession, type LocalMail, type MailSessionOptions } from "./session.ts";
import { safeStorage, shell } from "electron";
function checkKeyring() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error("A system credential store is required for Gmail.");
}
function sealGrant(client: GoogleClient, refreshToken: string) {
  return safeStorage.encryptString(packGoogleGrant(client, refreshToken)).toString("base64");
}
export function createMailService(options: MailSessionOptions) {
  const { use, stop, checked } = createMailSession(options, requestSync);
  async function withGmail<T>(
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
      const grant = unpackGoogleGrant(safeStorage.decryptString(Buffer.from(sealed, "base64")));
      const client = grant.client ?? environmentGoogleClient();
      if (!client) throw new ReconnectRequired("Reconnect Gmail.");
      const access = gmailAccess(client, grant.refreshToken, signal, async (replacement) => {
        const next = sealGrant(client, replacement);
        await local.db.rotateGrant(id, sealed, next);
        sealed = next;
      });
      return await work(gmailReader(access, signal), () => sealed);
    } catch (error) {
      if (!signal.aborted && (background || error instanceof ReconnectRequired))
        await local.db.fail(id, sealed, error instanceof ReconnectRequired ? "reconnect" : "retry");
      throw error;
    }
  }
  function requestSync(local: LocalMail, id: string) {
    if (local.abort.signal.aborted) return;
    const job = local.jobs.request(id, async (mailboxSignal) => {
      const signal = AbortSignal.any([local.abort.signal, mailboxSignal]);
      try {
        await withGmail(
          local,
          id,
          signal,
          (reader) =>
            syncMailbox(local.db, id, reader, signal, async () => {
              await checked(local.auth, signal);
            }),
          true,
        );
      } catch (error) {
        if (!signal.aborted)
          console.warn(
            `Inbox sync paused: ${syncFailureKind(error instanceof Error ? error : undefined)}.`,
          );
      }
    });
    void job.catch(() => {}); // Status is reported by accounts(); never log private provider output.
  }
  async function authorize(local: LocalMail, chooseClient = false, sealed?: string) {
    local.abort.signal.throwIfAborted();
    checkKeyring();
    const signal = local.abort.signal;
    const client = await clientForConsent(
      chooseClient,
      environmentGoogleClient(),
      () =>
        sealed
          ? unpackGoogleGrant(safeStorage.decryptString(Buffer.from(sealed, "base64"))).client
          : undefined,
      () => pickGoogleClient(signal),
    );
    if (!client) return null;
    // A native dialog may have been open across sign-out or a workspace change.
    signal.throwIfAborted();
    await checked(local.auth, signal);
    const grant = await connectGoogle(client, (url) => shell.openExternal(url), signal);
    local.abort.signal.throwIfAborted();
    return {
      provider: "gmail",
      providerAccountId: grant.providerAccountId,
      address: grant.address,
      protectedGrant: sealGrant(client, grant.refreshToken),
    };
  }
  return {
    stop,
    call: handleBridge(channel, methods, {
      accounts: (scope) =>
        use(scope, async (local) =>
          (await local.db.accounts()).map((box) => ({
            ...box,
            status: local.jobs.has(box.id) ? "syncing" : box.status,
          })),
        ),
      list: (q) => use(q, (local) => local.db.list(q)),
      nextPage: (q) =>
        use(q, async (local) => {
          const deadline = AbortSignal.any([local.abort.signal, AbortSignal.timeout(30_000)]);
          const result = await nextMailPage(
            q,
            await local.db.accounts(),
            local.db.cachedPage,
            (id, source, limit) =>
              local.jobs.run(
                id,
                (signal) =>
                  withGmail(local, id, signal, (reader, grant) =>
                    readOlderSource(
                      reader,
                      q,
                      id,
                      source,
                      limit,
                      (ids) => local.db.cachedDates(id, ids),
                      async (messages) => {
                        await checked(local.auth, signal);
                        signal.throwIfAborted();
                        await local.db.cacheOlder(id, grant(), messages);
                      },
                    ),
                  ),
                deadline,
              ),
          );
          // Never mistake a revoked workspace/app for an offline Gmail mailbox.
          await checked(local.auth, local.abort.signal);
          return result;
        }),
      thread: (q) => use(q, (local) => local.db.thread(q.id)),
      body: (q) => use(q, (local) => local.db.body(q.id)),
      picture: async (q) => {
        const { url, signal } = await use(q, async (local) => {
          const body = await local.db.body(q.id);
          return {
            url: body?.format === "html" ? referencedPicture(body.text, q.source) : null,
            signal: local.abort.signal,
          };
        });
        if (!url) return null;
        const image = await readMailPicture(url, signal).catch(() => null);
        signal.throwIfAborted();
        await checked(q, signal);
        signal.throwIfAborted();
        return image;
      },
      connectGmail: async (scope) => {
        const { local, sealed } = await use(scope, async (l) => ({
          local: l,
          sealed: await l.db.providerGrant("gmail"),
        }));
        const grant = await authorize(local, scope.chooseClient, sealed);
        if (!grant) return null;
        return use(scope, async (active) => {
          if (active !== local || local.abort.signal.aborted) throw new Error("Session changed.");
          const id = await local.db.connect({ ...grant, nickname: scope.nickname || null });
          requestSync(local, id);
          return id;
        });
      },
      reconnectGmail: async (q) => {
        const { local, previous } = await use(q, async (l) => {
          const row = await l.db.connection(q.mailboxId);
          if (row?.provider !== "gmail") throw new Error("Mailbox unavailable.");
          return { local: l, previous: row.protectedGrant };
        });
        const grant = await authorize(local, q.chooseClient, previous);
        if (!grant) return "cancelled";
        return use(q, async (active): Promise<"connected" | "different-account"> => {
          if (active !== local || local.abort.signal.aborted) throw new Error("Session changed.");
          // The store matches Google's verified subject, not the address or the local nickname.
          if (!(await local.db.reconnect(q.mailboxId, grant))) return "different-account";
          await local.jobs.cancel(q.mailboxId);
          requestSync(local, q.mailboxId);
          return "connected";
        });
      },
      rename: (q) => use(q, (local) => local.db.rename(q.mailboxId, q.nickname)),
      labelColor: (q) => use(q, (local) => local.db.labelColor(q.mailboxId, q.labelId, q.color)),
      labelVisibility: (q) => use(q, (local) => local.db.labelVisibility(q.mailboxId, q.change)),
      disconnect: (q) =>
        use(q, async (local) => {
          // Abort first and enqueue local removal immediately. A slow provider must not
          // keep the grant available. Any late sync commit requires a matching checkpoint.
          await Promise.all([local.jobs.cancel(q.mailboxId), local.db.disconnect(q.mailboxId)]);
        }),
      sync: (q) =>
        use(q, async (local) => {
          const boxes = await local.db.accounts();
          const selected = q.mailboxId === null ? boxes : boxes.filter((b) => b.id === q.mailboxId);
          for (const box of selected) requestSync(local, box.id);
        }),
    }),
  };
}
