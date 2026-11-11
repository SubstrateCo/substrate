import { createMessageNotifications, type MessageNotice } from "./message-notifications.ts";
import { expect, test } from "bun:test";

const notice = (id: string) => ({
  id,
  messageId: id,
  conversationId: "conversation",
  kind: "message",
  readAt: null,
  createdAt: id === "old" ? "2026-01-01T00:00:00.000Z" : "2026-01-01T00:00:01.000Z",
});
const change = {
  version: 1,
  type: "change",
  domain: "notifications",
  organizationId: "org",
  id: "event",
} as const;

test("native alerts skip history, deduplicate hints, and recheck access before opening", async () => {
  let rows = [notice("old")];
  const shown: (() => Promise<void>)[] = [];
  const opened: string[] = [];
  const notifications = createMessageNotifications({
    read: async () => rows,
    sessionKey: () => "account",
    show: (click) => {
      shown.push(click);
      return () => {};
    },
    open: (target) => {
      opened.push(target.messageId);
    },
  });
  await notifications.connect("org");
  expect(shown).toHaveLength(0);
  rows = [notice("new"), ...rows];
  await notifications.receive(change);
  await notifications.receive(change);
  expect(shown).toHaveLength(1);
  rows = [];
  await shown[0]!();
  expect(opened).toEqual([]);
});

test("workspace/session changes discard in-flight alerts and old notification clicks", async () => {
  let resolve: ((rows: ReturnType<typeof notice>[]) => void) | undefined;
  let rows = [notice("old")];
  let delayed = false;
  let cookie = "one";
  const shown: (() => Promise<void>)[] = [];
  const opened: string[] = [];
  const notifications = createMessageNotifications({
    read: () =>
      delayed
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(rows),
    sessionKey: () => cookie,
    show: (click) => {
      shown.push(click);
      return () => {};
    },
    open: (target) => {
      opened.push(target.messageId);
    },
  });
  await notifications.connect("org");
  rows = [notice("new")];
  await notifications.receive(change);
  cookie = "two";
  await shown[0]!();
  expect(opened).toEqual([]);
  await notifications.connect("org");
  delayed = true;
  const pending = notifications.receive(change);
  await Promise.resolve();
  notifications.disconnect();
  resolve!([notice("late")]);
  await pending;
  expect(shown).toHaveLength(1);
});

test("periodic reconciliation recovers a missed hint without replaying old feed entries", async () => {
  let rows = [notice("new")];
  const opened: string[] = [];
  const clicks: (() => Promise<void>)[] = [];
  const notifications = createMessageNotifications({
    read: async () => rows,
    sessionKey: () => "account",
    show: (click) => {
      clicks.push(click);
      return () => {};
    },
    open: (target) => {
      opened.push(target.messageId);
    },
  });
  await notifications.connect("org");
  rows = [notice("missed"), notice("old")];
  await notifications.reconcile();
  expect(clicks).toHaveLength(1);
  await clicks[0]!();
  expect(opened).toEqual(["missed"]);
  notifications.disconnect();
  await clicks[0]!();
  expect(opened).toEqual(["missed"]);
});

test("native alerts ignore notifications already read on another device", async () => {
  const shown: string[] = [];
  let rows: MessageNotice[] = [];
  const notifications = createMessageNotifications({
    read: async () => rows,
    sessionKey: () => "account",
    show: () => {
      shown.push("alert");
      return () => {};
    },
    open: () => {},
  });
  await notifications.connect("org");
  rows = [{ ...notice("read"), readAt: "2026-01-01T00:00:02.000Z" }];
  await notifications.reconcile();
  expect(shown).toEqual([]);
});

test("a failed initial feed read recovers quietly, then alerts for new arrivals", async () => {
  let available = false;
  let rows = [notice("old")];
  const alerts: string[] = [];
  const notifications = createMessageNotifications({
    read: async () => {
      if (!available) throw new Error("offline");
      return rows;
    },
    sessionKey: () => "account",
    show: () => {
      alerts.push("alert");
      return () => {};
    },
    open: () => {},
  });
  await notifications.connect("org");
  available = true;
  await notifications.reconcile();
  expect(alerts).toEqual([]);
  rows = [notice("new")];
  await notifications.reconcile();
  expect(alerts).toEqual(["alert"]);
});
