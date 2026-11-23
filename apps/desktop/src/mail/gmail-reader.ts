import type { SyncedMail, SyncPage } from "@substrate/client-storage/mail";
import { mailFlag, mailPageSize } from "@substrate/contracts/mail";
import type { MailFolder } from "@substrate/contracts/mail/ipc";

import { ReconnectRequired, type MailChanges } from "./provider.ts";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const base = "https://gmail.googleapis.com/gmail/v1/users/me/";
const gmailViewLabel: Record<MailFolder["view"], string | undefined> = {
  inbox: "INBOX",
  new: "INBOX",
  unread: "UNREAD",
  starred: "STARRED",
  drafts: "DRAFT",
  sent: "SENT",
  archive: undefined,
  spam: "SPAM",
  trash: "TRASH",
};
const checkpointSize = 4;
const ref = z.object({ id: z.string().min(1) });
const list = z.object({ messages: z.array(ref).default([]), nextPageToken: z.string().optional() });
const event = z.array(z.object({ message: ref })).optional();
const history = z.object({
  historyId: z.string().min(1),
  nextPageToken: z.string().optional(),
  history: z
    .array(
      z.object({
        messages: z.array(ref).optional(),
        messagesAdded: event,
        messagesDeleted: event,
        labelsAdded: event,
        labelsRemoved: event,
      }),
    )
    .default([]),
});
const cursorSchema = z.discriminatedUnion("kind", [
  // A legacy unbounded backfill resumes as a fresh recent window, never at its old page token.
  z.object({ kind: z.literal("full") }),
  z.object({
    kind: z.literal("recent"),
    after: z.string(),
    // Older desktop versions expect this field in a saved partial batch.
    started: z.number(),
    pending: z.array(z.string().min(1)).max(mailPageSize),
  }),
  z.object({ kind: z.literal("history"), after: z.string(), token: z.string().optional() }),
]);
const partSchema = z.object({
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  body: z.object({ data: z.string().optional(), attachmentId: z.string().optional() }).optional(),
  headers: z
    .array(z.object({ name: z.string().default(""), value: z.string().default("") }))
    .optional(),
  get parts(): z.ZodOptional<z.ZodArray<typeof partSchema>> {
    return z.array(partSchema).optional();
  },
});
const item = ref.extend({
  threadId: z.string().optional(),
  internalDate: z.coerce.number(),
  snippet: z.string().default(""),
  labelIds: z.array(z.string()).default([]),
  payload: partSchema,
});
const gmailFlags = new Map(
  Object.entries(mailFlag).map(([key, value]) => [
    key === "drafts" ? "DRAFT" : key.toUpperCase(),
    value,
  ]),
);
const flagsFor = (labels: string[]) =>
  labels.reduce((bits, label) => bits | (gmailFlags.get(label) ?? 0), 0);
const messageLabels = ref.extend({ labelIds: z.array(z.string()).default([]) });
class GoogleReadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Gmail read failed.");
    this.status = status;
  }
}
/** Only protocol status and schema field names may leave the sync worker, never response data. */
export function syncFailureKind(error: Error | undefined) {
  if (error instanceof GoogleReadError) return `Gmail HTTP ${error.status}`;
  if (error instanceof ReconnectRequired) return "Google authorization";
  if (error instanceof z.ZodError) {
    const field = error.issues[0]?.path.join(".");
    return `provider response shape: ${field || "root"}`;
  }
  return "local storage, connection or session";
}
type Part = z.output<typeof partSchema>;
function decodeBody(part: Part, encoded: string) {
  const type = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  const match = /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  const bytes = Buffer.from(encoded, "base64url");
  try {
    return new TextDecoder(match?.[1] ?? match?.[2]).decode(bytes);
  } catch {
    // Unknown sender-supplied encodings must not stall the entire mailbox checkpoint.
    return bytes.toString("utf8");
  }
}
function bodyPart(part: Part, mime: string): Part | undefined {
  if (part.filename || part.mimeType === "message/rfc822") return undefined;
  if (part.mimeType === mime && (part.body?.data || part.body?.attachmentId)) return part;
  for (const child of part.parts ?? []) {
    const match = bodyPart(child, mime);
    if (match) return match;
  }
}

type ReadRequest = (url: URL, init: RequestInit) => Promise<Response>;
export function gmailReader(
  token: () => Promise<string>,
  signal: AbortSignal,
  request: ReadRequest = fetch,
) {
  async function get(path: string, params: Record<string, string> = {}, interactive = false) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const lastTry = interactive || attempt >= 2;
      const backoff = 1000 * 2 ** attempt;
      const access = await token();
      let response: Response;
      try {
        response = await request(url, {
          headers: { authorization: `Bearer ${access}` },
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        });
      } catch (error) {
        if (
          lastTry ||
          signal.aborted ||
          !(error instanceof TypeError || error instanceof DOMException)
        )
          throw error;
        await setTimeout(backoff, undefined, { signal });
        continue;
      }
      if (response.ok) return response.json();
      if (response.status === 401) throw new ReconnectRequired("Reconnect Gmail.");
      let retry = [429, 500, 502, 503, 504].includes(response.status);
      if (response.status === 403) {
        const data = z
          .object({ error: z.object({ errors: z.array(z.object({ reason: z.string() })) }) })
          .safeParse(await response.json().catch(() => null));
        retry =
          data.success &&
          data.data.error.errors.some(
            (e) => e.reason === "rateLimitExceeded" || e.reason === "userRateLimitExceeded",
          );
      }
      if (!response.bodyUsed) await response.body?.cancel();
      if (lastTry || !retry) throw new GoogleReadError(response.status);
      const retryAfter = response.headers.get("retry-after");
      const seconds = Number(retryAfter);
      const cooldown = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter ?? "") - Date.now();
      const ms = Math.max(Number.isFinite(cooldown) ? cooldown : 0, backoff);
      // Release the shared mailbox lane instead of blocking Next for the whole cooldown.
      if (ms > 30_000) throw new GoogleReadError(response.status);
      await setTimeout(ms, undefined, { signal });
    }
  }
  async function detail(id: string, interactive: boolean): Promise<SyncedMail> {
    const data = item.parse(
      await get(`messages/${encodeURIComponent(id)}`, { format: "full" }, interactive),
    );
    const header = (name: string) =>
      data.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    const html = bodyPart(data.payload, "text/html");
    const plain = bodyPart(data.payload, "text/plain");
    async function text(body: Part | undefined) {
      if (!body) return undefined;
      const attachment = body.body?.attachmentId;
      let encoded = body.body?.data;
      if (!encoded && attachment) {
        try {
          const result = await get(
            `messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment)}`,
            {},
            interactive,
          );
          encoded = z.object({ data: z.string() }).parse(result).data;
        } catch (error) {
          // A missing MIME part is not a deleted message.
          if (error instanceof GoogleReadError && error.status === 404) return undefined;
          throw error;
        }
      }
      return encoded === undefined ? undefined : decodeBody(body, encoded);
    }
    const htmlText = await text(html);
    const plainText = await text(plain);
    return {
      remoteId: data.id,
      threadId: data.threadId ?? null,
      timestamp: data.internalDate,
      subject: header("subject"),
      from: header("from"),
      to: header("to"),
      flags: flagsFor(data.labelIds),
      labelIds: data.labelIds,
      snippet: data.snippet,
      body:
        htmlText === undefined
          ? { format: "plain", text: plainText ?? data.snippet }
          : { format: "html", text: htmlText, plainText },
    };
  }
  async function readIds<T>(ids: Iterable<string>, read: (id: string) => Promise<T>) {
    const messages: T[] = [];
    const removed: string[] = [];
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += checkpointSize) {
      signal.throwIfAborted();
      const batch = unique.slice(i, i + checkpointSize);
      const results = await Promise.allSettled(batch.map(read));
      for (const [j, result] of results.entries()) {
        if (result.status === "fulfilled") messages.push(result.value);
        else if (result.reason instanceof GoogleReadError && result.reason.status === 404)
          removed.push(batch[j]!);
        else throw result.reason;
      }
    }
    return { messages, removed };
  }
  async function listIds(params: Record<string, string>, limit: number) {
    const ids = new Set<string>(),
      tokens = new Set<string>();
    let token: string | undefined;
    do {
      const remaining = Math.min(500, limit - ids.size);
      const page = list.parse(
        await get("messages", {
          maxResults: String(remaining),
          fields: "messages(id),nextPageToken",
          ...params,
          ...(token && { pageToken: token }),
        }),
      );
      for (const m of page.messages.slice(0, remaining)) ids.add(m.id);
      token = page.nextPageToken;
      if (!token || ids.size >= limit) break;
      if (tokens.has(token)) throw new Error("Gmail pagination stalled.");
      tokens.add(token);
    } while (token);
    return [...ids];
  }
  const latestIds = () => listIds({ includeSpamTrash: "true" }, mailPageSize);
  async function chunk(after: string, started: number, ids: string[]): Promise<SyncPage> {
    const pending = ids.slice(checkpointSize);
    return {
      ...(await readIds(ids.slice(0, checkpointSize), (id) => detail(id, false))),
      done: !pending.length,
      cursor: JSON.stringify(
        pending.length ? { kind: "recent", after, started, pending } : { kind: "history", after },
      ),
    };
  }
  async function startRecent() {
    // Take the watermark first. Changes during this bounded snapshot belong to the next sync.
    const { historyId } = z.object({ historyId: z.string().min(1) }).parse(await get("profile"));
    return chunk(historyId, Date.now(), await latestIds());
  }
  async function changes(after: string, token?: string): Promise<MailChanges> {
    let page;
    try {
      page = history.parse(
        await get("history", {
          startHistoryId: after,
          maxResults: String(mailPageSize),
          ...(token && { pageToken: token }),
        }),
      );
    } catch (error) {
      if (error instanceof GoogleReadError && error.status === 404) return startRecent();
      if (error instanceof GoogleReadError && error.status === 400 && token) return changes(after);
      throw error;
    }
    const ids = new Set<string>();
    const deleted = new Set<string>();
    for (const h of page.history) {
      for (const m of h.messages ?? []) ids.add(m.id);
      for (const events of [h.messagesAdded, h.labelsAdded, h.labelsRemoved])
        for (const e of events ?? []) ids.add(e.message.id);
      for (const e of h.messagesDeleted ?? []) deleted.add(e.message.id);
    }
    for (const id of deleted) ids.delete(id);
    // Commit explicit removals and refresh cached labels on every history page. Only
    // the final page can advance the watermark or download the bounded recent window.
    if (page.nextPageToken) {
      return {
        cursor: JSON.stringify({ kind: "history", after, token: page.nextPageToken }),
        done: false,
        messages: [],
        removed: [...deleted],
        changedIds: [...ids],
      };
    }
    const recent = token || ids.size ? await latestIds() : [];
    const refresh = recent.filter((id) => !deleted.has(id) && (token !== undefined || ids.has(id)));
    for (const id of refresh) ids.delete(id);
    const pageOfBodies = await chunk(page.historyId, Date.now(), refresh);
    return {
      ...pageOfBodies,
      removed: [...deleted, ...pageOfBodies.removed],
      changedIds: [...ids],
    };
  }
  return {
    // The unread list excludes spam and trash, just like the local view. Listing IDs
    // also counts older unread messages whose bodies have never been opened on this device.
    unreadIds: () => listIds({ labelIds: "UNREAD", includeSpamTrash: "false" }, Infinity),
    messageLabels: (ids: Iterable<string>) =>
      readIds(ids, async (id) => {
        const data = messageLabels.parse(
          await get(`messages/${encodeURIComponent(id)}`, {
            format: "minimal",
            fields: "id,labelIds",
          }),
        );
        return { remoteId: data.id, labelIds: data.labelIds, flags: flagsFor(data.labelIds) };
      }),
    /** A separate, user-driven Gmail list. Its opaque token is valid only with the
     * original mailbox, filter and time boundary; it is never a history checkpoint. */
    async olderIds(folder: MailFolder, before: number, token: string | null, limit: number) {
      const view = folder.view;
      const label = folder.label?.id ?? gmailViewLabel[view];
      const terms = [`before:${Math.floor(before / 1000) + 1}`];
      if (!folder.label && view === "archive") terms.push("-in:inbox -in:sent -in:drafts");
      if (!folder.label && view === "new") terms.push("newer_than:1d");
      const search = folder.search.trim().replace(/["\\]/g, " ").trim();
      if (search) terms.push(`"${search}"`);
      const params = {
        q: terms.join(" "),
        maxResults: String(limit),
        ...(label && { labelIds: label }),
        ...(!folder.label && (view === "spam" || view === "trash") && { includeSpamTrash: "true" }),
        ...(token && { pageToken: token }),
      };
      try {
        const page = list.parse(await get("messages", params, true));
        return {
          ids: [...new Set(page.messages.slice(0, limit).map((m) => m.id))],
          token: page.nextPageToken ?? null,
        };
      } catch (e) {
        if (token && e instanceof GoogleReadError && e.status === 400) return null;
        throw e;
      }
    },
    olderMessages: async (ids: string[]) => (await readIds(ids, (id) => detail(id, true))).messages,
    async labels() {
      const catalog = z
        .object({
          labels: z
            .array(ref.extend({ name: z.string(), type: z.enum(["system", "user"]) }))
            .default([]),
        })
        .parse(await get("labels"));
      // Standard folders/flags already have their own UI. Preserve categories, custom and nested names.
      return catalog.labels
        .filter((l) => l.type === "user" || !gmailFlags.has(l.id))
        .map(({ id, name }) => ({ id, name }));
    },
    async page(cursor: string | null) {
      const state = cursor ? cursorSchema.parse(JSON.parse(cursor)) : undefined;
      if (state?.kind === "recent") return chunk(state.after, state.started, state.pending);
      if (state?.kind === "history") return changes(state.after, state.token);
      return startRecent();
    },
  };
}
