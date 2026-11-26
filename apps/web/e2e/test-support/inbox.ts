import { mailListWorker, openMailStore } from "@substrate/client-storage/mail";
import { handleBridge, type IpcValue } from "@substrate/contracts/desktop/ipc";
import { mailFlag, type MailMessageAction } from "@substrate/contracts/mail";
import { channel, methods } from "@substrate/contracts/mail/ipc";

import { gmailReader } from "../../../desktop/src/mail/gmail/gmail-reader";
import { applyMailActions } from "../../../desktop/src/mail/message-actions";
import { nextMailPage, readOlderSource } from "../../../desktop/src/mail/older-page";
import { mailboxSyncJobs } from "../../../desktop/src/mail/sync-jobs";
import { test as base, visit } from "./fixtures";
import { fixturePicture, seedInbox } from "./inbox-seed";
import { expect, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

declare global {
  interface Window {
    fixtureMailCall: (method: string, input: IpcValue) => Promise<IpcValue>;
  }
}

/** Real signed-in workspace and per-test SQLite store. Only Google, artwork and the Electron
 * IPC transport are substituted. No credentials or database code enter the browser. */
export const test = base.extend<{
  inbox: Page;
  historySize: number;
  cachedHistory: number[];
  gmailPages: { lists: number; details: string[]; unavailable: boolean; refuseWrite?: string };
}>({
  historySize: [0, { option: true }],
  cachedHistory: [[50], { option: true }],
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
  gmailPages: async ({}, use) => {
    await use({ lists: 0, details: [], unavailable: false });
  },
  inbox: async ({ account, client, gmailPages, historySize, cachedHistory }, use) => {
    const enabled = await account.request.patch("/api/v1/organizations/apps", {
      data: {
        organizationId: account.organizationId,
        enabledApps: ["messages", "agents", "inbox"],
      },
    });
    expect(enabled.ok()).toBe(true);
    const user = await client(account);
    const dir = await mkdtemp(join(tmpdir(), "inbox-renderer-"));
    try {
      const file = join(dir, "mail.sqlite");
      const store = await openMailStore(file, account.organizationId);
      const reads = mailListWorker(file, account.organizationId);
      try {
        await seedInbox(store);
        const now = Date.now();
        const history = Array.from({ length: historySize }, (_, i) => ({
          id: `history-${i}`,
          stamp: now - (10 + i) * 86_400_000,
          subject: `History message ${i}`,
        }));
        const saved = history.filter((_, i) => cachedHistory.includes(i));
        if (saved.length) {
          const work = (await store.accounts()).find(
            (b) => b.address === "alex@fieldwork.example",
          )!;
          await store.cacheOlder(
            work.id,
            "test-only",
            saved.map((m) => ({
              remoteId: m.id,
              threadId: m.id,
              timestamp: m.stamp,
              subject: m.subject,
              from: "",
              to: "",
              snippet: "",
              flags: mailFlag.inbox | mailFlag.unread,
              labelIds: ["INBOX", "UNREAD"],
              body: { format: "plain", text: m.subject },
            })),
          );
        }
        const local = {
          db: store,
          jobs: mailboxSyncJobs(),
          abort: new AbortController(),
          auth: {
            accountKey: "fixture",
            userId: "fixture-owner",
            organizationId: account.organizationId,
            identity: "fixture",
          },
        };
        async function change(
          ids: string[],
          action: MailMessageAction,
          mode: "message" | "conversation",
        ) {
          const messages = (await Promise.all(ids.map((id) => store.thread(id)))).flat();
          const targets = await store.actionTargets(messages.map((m) => m.id));
          const remote = targets.map((target) => {
            const msg = messages.find((m) => m.id === target.id)!;
            const labels = new Set(msg.labelIds);
            for (const [name, bit] of Object.entries(mailFlag))
              if (msg.flags & bit) labels.add(name === "drafts" ? "DRAFT" : name.toUpperCase());
            return { ...target, labels };
          });
          return applyMailActions(
            local,
            ids,
            mode,
            action,
            async (_l, box, signal, work) =>
              work(
                gmailReader(
                  async () => "fixture",
                  signal,
                  async (url, init) => {
                    const [kind, id, verb] = url.pathname.split("/me/")[1]!.split("/");
                    if (gmailPages.unavailable || id === gmailPages.refuseWrite)
                      return new Response(null, { status: 429 });
                    const members = remote.filter(
                      (m) =>
                        m.mailboxId === box &&
                        (kind === "threads" ? m.threadId : m.remoteId) === id,
                    );
                    if (!members.length) return new Response(null, { status: 404 });
                    if (init.method === "POST")
                      for (const m of members) {
                        if (verb === "trash") {
                          m.labels.add("TRASH");
                          m.labels.delete("INBOX");
                        } else if (init.body === '{"addLabelIds":["UNREAD"]}')
                          m.labels.add("UNREAD");
                        else m.labels.delete("UNREAD");
                      }
                    const states = members.map((m) => ({
                      id: m.remoteId,
                      labelIds: [...m.labels],
                    }));
                    return Response.json(kind === "threads" ? { id, messages: states } : states[0]);
                  },
                ),
                () => "test-only",
              ),
            async () => {},
            () => {},
          );
        }
        const one = async (id: string, action: MailMessageAction) =>
          (await change([id], action, "message"))[0]!.result;
        const dispatch = handleBridge(channel, methods, {
          markRead: (q) => one(q.id, "markRead"),
          markUnread: (q) => one(q.id, "markUnread"),
          trashMessage: (q) => one(q.id, "trashMessage"),
          changeConversations: (q) => change(q.ids, q.action, "conversation"),
          accounts: () => reads.accounts(),
          list: (q) => reads.list(q),
          nextPage: async (q) =>
            nextMailPage(q, await reads.accounts(), reads.cachedPage, async (id, source, limit) => {
              const box = (await store.connection(id))!;
              const reader = gmailReader(
                async () => "fixture",
                new AbortController().signal,
                async (url) => {
                  const path = url.pathname.split("/me/")[1]!;
                  if (path === "messages") {
                    gmailPages.lists++;
                    if (gmailPages.unavailable) throw new TypeError("Google offline");
                    const label = url.searchParams.get("labelIds");
                    if (!historySize || (label !== "INBOX" && label !== "UNREAD"))
                      return Response.json({});
                    if (box.providerAccountId !== "alex@fieldwork.example")
                      return Response.json({ messages: label === "INBOX" ? [{ id: "old" }] : [] });
                    const before =
                      Number(/before:(\d+)/.exec(url.searchParams.get("q") ?? "")?.[1]) * 1000;
                    const term = /"([^"]+)"/.exec(url.searchParams.get("q") ?? "")?.[1] ?? "";
                    const matches = history.filter(
                      (m) => m.stamp < before && m.subject.includes(term),
                    );
                    const start = Number(url.searchParams.get("pageToken") ?? 0);
                    const end = start + Number(url.searchParams.get("maxResults"));
                    return Response.json({
                      messages: matches.slice(start, end).map(({ id }) => ({ id })),
                      nextPageToken: end < matches.length ? String(end) : undefined,
                    });
                  }
                  const message = history.find((m) => path === `messages/${m.id}`);
                  if (!message) throw new Error("Unexpected Gmail detail");
                  gmailPages.details.push(message.id);
                  return Response.json({
                    id: message.id,
                    threadId: message.id,
                    internalDate: message.stamp,
                    labelIds: ["INBOX", "UNREAD"],
                    payload: { headers: [{ name: "Subject", value: message.subject }] },
                  });
                },
              );
              return readOlderSource(
                reader,
                q,
                id,
                source,
                limit,
                (ids) => store.cachedDates(id, ids),
                (messages) => store.cacheOlder(id, box.protectedGrant, messages),
              );
            }),
          thread: (q) => store.thread(q.id),
          body: (q) => store.body(q.id),
          picture: async (q) => {
            const body = await store.body(q.id);
            return body?.text.includes(q.source) ? fixturePicture(q.source) : null;
          },
          rename: (q) => store.rename(q.mailboxId, q.nickname),
          disconnect: (q) => store.disconnect(q.mailboxId),
          labelColor: (q) => store.labelColor(q.mailboxId, q.labelId, q.color),
          labelVisibility: (q) => store.labelVisibility(q.mailboxId, q.change),
          connectGmail: async () => null,
          reconnectGmail: () => "cancelled" as const,
          sync: async () => {},
        });
        const { page } = user;
        await page.exposeFunction("fixtureMailCall", dispatch);
        await page.addInitScript((names) => {
          Object.defineProperty(window, "substrateMail", {
            value: Object.fromEntries(
              names.map((name) => [name, (input: IpcValue) => window.fixtureMailCall(name, input)]),
            ),
          });
        }, Object.keys(methods));
        await visit(user, undefined, "/inbox");
        await use(page);
      } finally {
        await reads.close();
        store.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
});
