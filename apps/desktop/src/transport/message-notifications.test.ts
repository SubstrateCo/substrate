import {
  alertText,
  createMessageNotifications,
  noticeURL,
  type AlertPreferences,
  type MessageNotice,
  type NativeAlert,
  type NoticeTarget,
} from "./message-notifications.ts";
import { expect, test } from "bun:test";

let clock = 0;
const notice = (id: string, overrides: Partial<MessageNotice> = {}): MessageNotice => ({
  id,
  messageId: id,
  conversationId: "conversation",
  entityId: null,
  projectEntityId: null,
  kind: "message",
  readAt: null,
  alert: true,
  title: "New message",
  actorName: "Maya",
  excerpt: "Ready to ship",
  sourceName: "Launch",
  createdAt: id === "old" ? "2026-01-01T00:00:00.000Z" : "2026-01-01T00:00:01.000Z",
  ...overrides,
});
const change = {
  version: 1,
  type: "change",
  domain: "notifications",
  organizationId: "org",
  id: "event",
} as const;
const messageOf = (target: NoticeTarget) => (target.kind === "message" ? target.messageId : "");

function harness(
  initial: MessageNotice[],
  preferences: AlertPreferences = { preview: "hidden", sound: true, flash: "idle" },
) {
  const shown: { alert: NativeAlert; click: () => Promise<void>; open: boolean }[] = [];
  const opened: NoticeTarget[] = [];
  const state = { rows: initial, preferences, cookie: "account", shown, opened };
  const notifications = createMessageNotifications({
    read: async () => state.rows,
    readPreferences: async () => state.preferences,
    sessionKey: () => state.cookie,
    show: (alert, click) => {
      const entry = { alert, click, open: true };
      state.shown.push(entry);
      return () => {
        entry.open = false;
      };
    },
    open: (target) => {
      state.opened.push(target);
    },
    now: () => clock,
  });
  const open = () => state.shown.filter((entry) => entry.open);
  return { state, notifications, open };
}

test("native alerts skip history, deduplicate hints, and recheck access before opening", async () => {
  const { state, notifications } = harness([notice("old")]);
  await notifications.connect("org");
  expect(state.shown).toHaveLength(0);
  state.rows = [notice("new"), ...state.rows];
  await notifications.receive(change);
  await notifications.receive(change);
  expect(state.shown).toHaveLength(1);
  state.rows = [];
  await state.shown[0]!.click();
  expect(state.opened).toEqual([]);
});

test("workspace/session changes discard in-flight alerts and old notification clicks", async () => {
  let resolve: ((rows: MessageNotice[]) => void) | undefined;
  let rows = [notice("old")];
  let delayed = false;
  let cookie = "one";
  const shown: (() => Promise<void>)[] = [];
  const opened: NoticeTarget[] = [];
  const notifications = createMessageNotifications({
    read: () =>
      delayed
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(rows),
    readPreferences: async () => ({ preview: "hidden", sound: true, flash: "idle" }),
    sessionKey: () => cookie,
    show: (_alert, click) => {
      shown.push(click);
      return () => {};
    },
    open: (target) => {
      opened.push(target);
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
  const { state, notifications } = harness([notice("new")]);
  await notifications.connect("org");
  state.rows = [notice("missed"), notice("old")];
  await notifications.reconcile();
  expect(state.shown).toHaveLength(1);
  await state.shown[0]!.click();
  expect(state.opened.map(messageOf)).toEqual(["missed"]);
  notifications.disconnect();
  await state.shown[0]!.click();
  expect(state.opened.map(messageOf)).toEqual(["missed"]);
});

test("native alerts ignore notifications already read on another device", async () => {
  const { state, notifications } = harness([]);
  await notifications.connect("org");
  state.rows = [notice("read", { readAt: "2026-01-01T00:00:02.000Z" })];
  await notifications.reconcile();
  expect(state.shown).toEqual([]);
});

test("notices the recipient's settings silence stay quiet", async () => {
  const { state, notifications } = harness([]);
  await notifications.connect("org");
  state.rows = [notice("muted", { alert: false })];
  await notifications.reconcile();
  expect(state.shown).toEqual([]);
});

test("a conversation alert closes once its notices are read or leave the feed, and others stay", async () => {
  const { state, notifications, open } = harness([notice("old")]);
  await notifications.connect("org");
  state.rows = [
    notice("unread", { conversationId: "c1" }),
    notice("deleted", { conversationId: "c2" }),
    notice("read", { conversationId: "c3" }),
  ];
  await notifications.reconcile();
  expect(open()).toHaveLength(3);
  state.rows = [
    notice("unread", { conversationId: "c1" }),
    notice("read", { conversationId: "c3", readAt: "2026-01-01T00:00:02.000Z" }),
  ];
  await notifications.reconcile();
  expect(open()).toHaveLength(1);
  await open()[0]!.click();
  expect(state.opened.map(messageOf)).toEqual(["unread"]);
});

test("new notices in one conversation replace its alert with a count", async () => {
  const { state, notifications, open } = harness([]);
  await notifications.connect("org");
  state.rows = [notice("one", { createdAt: "2026-01-01T00:00:01.000Z" })];
  await notifications.reconcile();
  state.rows = [notice("two", { createdAt: "2026-01-01T00:00:02.000Z" }), ...state.rows];
  await notifications.reconcile();
  expect(open().map((entry) => entry.alert.title)).toEqual(["2 new notifications"]);
  state.rows = [
    notice("two", { createdAt: "2026-01-01T00:00:02.000Z", readAt: "2026-01-01T00:00:03.000Z" }),
    notice("one", { createdAt: "2026-01-01T00:00:01.000Z" }),
  ];
  await notifications.reconcile();
  expect(open()).toHaveLength(1);
});

test("a burst across many conversations shows one summary that opens the feed", async () => {
  clock = 0;
  const { state, notifications, open } = harness([]);
  await notifications.connect("org");
  state.rows = ["a", "b", "c", "d"].map((id) => notice(id, { conversationId: id }));
  await notifications.reconcile();
  expect(open().map((entry) => entry.alert.title)).toEqual(["4 new notifications"]);
  await open()[0]!.click();
  expect(state.opened).toEqual([{ kind: "feed", organizationId: "org" }]);
});

test("alerts beyond the rate limit join one summary until the window passes", async () => {
  clock = 0;
  const { state, notifications, open } = harness([]);
  await notifications.connect("org");
  for (const [index, id] of ["a", "b", "c", "d"].entries()) {
    state.rows = [
      notice(id, { conversationId: id, createdAt: `2026-01-01T00:00:0${index + 1}.000Z` }),
      ...state.rows,
    ];
    await notifications.reconcile();
  }
  expect(open().map((entry) => entry.alert.title)).toEqual(["4 new notifications"]);
  clock = 120_000;
  for (const group of open()) group.open = false;
  state.rows = state.rows.map((row) => ({ ...row, readAt: "2026-01-01T00:00:09.000Z" }));
  await notifications.reconcile();
  state.rows = [notice("e", { conversationId: "e", createdAt: "2026-01-01T00:00:10.000Z" })];
  await notifications.reconcile();
  expect(open().map((entry) => entry.alert.title)).toEqual(["New message"]);
});

test("a burst plays one sound: updates and alerts soon after the first stay silent", async () => {
  clock = 0;
  const { state, notifications } = harness([]);
  await notifications.connect("org");
  state.rows = [notice("a", { conversationId: "a" })];
  await notifications.reconcile();
  clock = 2_000;
  state.rows = [
    notice("b", { conversationId: "b", createdAt: "2026-01-01T00:00:02.000Z" }),
    ...state.rows,
  ];
  await notifications.reconcile();
  clock = 3_000;
  state.rows = [
    notice("a2", { conversationId: "a", createdAt: "2026-01-01T00:00:03.000Z" }),
    ...state.rows,
  ];
  await notifications.reconcile();
  expect(state.shown.map((entry) => entry.alert.silent)).toEqual([false, true, true]);
  expect(state.shown[2]!.alert.flash).toBe("never");
  clock = 20_000;
  state.rows = [
    notice("c", { conversationId: "c", createdAt: "2026-01-01T00:00:04.000Z" }),
    ...state.rows,
  ];
  await notifications.reconcile();
  expect(state.shown.at(-1)!.alert.silent).toBe(false);
});

test("several new notices in one conversation make one alert", async () => {
  const { state, notifications } = harness([]);
  await notifications.connect("org");
  state.rows = ["x", "y", "z"].map((id) => notice(id));
  await notifications.reconcile();
  expect(state.shown.map((entry) => entry.alert.title)).toEqual(["3 new notifications"]);
});

test("a reconnect summarizes what arrived while away; a first connect stays quiet", async () => {
  const { state, notifications, open } = harness([notice("old")]);
  await notifications.connect("org");
  expect(state.shown).toEqual([]);
  notifications.disconnect();
  state.rows = [
    notice("away", { createdAt: "2026-01-01T00:00:05.000Z" }),
    notice("quiet", { createdAt: "2026-01-01T00:00:06.000Z", alert: false }),
    notice("old"),
  ];
  await notifications.connect("org");
  expect(open().map((entry) => entry.alert.title)).toEqual(["1 new notification"]);
  notifications.disconnect();
  state.cookie = "other";
  await notifications.connect("org");
  expect(open()).toEqual([]);
});

test("assignments open their task", async () => {
  const { state, notifications } = harness([]);
  await notifications.connect("org");
  state.rows = [
    notice("task", {
      kind: "assignment",
      conversationId: null,
      messageId: null,
      entityId: "t1",
      projectEntityId: "p1",
      title: "Ship",
    }),
  ];
  await notifications.reconcile();
  expect(state.shown[0]!.alert.title).toBe("Task assigned to you");
  await state.shown[0]!.click();
  expect(state.opened).toEqual([
    { kind: "task", organizationId: "org", projectEntityId: "p1", taskEntityId: "t1" },
  ]);
});

test("alerts follow the account's sound, flash and preview settings", async () => {
  const { state, notifications } = harness([], { preview: "full", sound: false, flash: "never" });
  await notifications.connect("org");
  state.rows = [notice("new")];
  await notifications.reconcile();
  expect(state.shown[0]!.alert).toEqual({
    title: "New message in Launch",
    body: "Maya: Ready to ship",
    silent: true,
    flash: "never",
  });
  state.preferences = { preview: "hidden", sound: true, flash: "always" };
  await notifications.receive({ ...change, domain: "notification-preferences" });
  state.rows = [notice("next", { conversationId: "c2", createdAt: "2026-01-01T00:00:02.000Z" })];
  await notifications.reconcile();
  expect(state.shown[1]!.alert).toMatchObject({ silent: false, flash: "always" });
});

test("clicked alerts open the message, the task, or the feed in their workspace", () => {
  const base = "substrate://app/";
  const organizationId = "org";
  expect(
    noticeURL({ kind: "message", organizationId, conversationId: "c", messageId: "m" }, base),
  ).toBe("substrate://app/messages?workspaceId=org&conversationId=c&messageId=m");
  expect(
    noticeURL({ kind: "task", organizationId, projectEntityId: "p", taskEntityId: "t" }, base),
  ).toBe("substrate://app/tasks?workspaceId=org&projectId=p&taskId=t");
  expect(noticeURL({ kind: "feed", organizationId }, base)).toBe(
    "substrate://app/notifications?workspaceId=org",
  );
});

test("hidden previews never show names or message text", () => {
  const row = notice("one");
  expect(alertText(row, 1, "hidden")).toEqual({
    title: "New message",
    body: "Open Substrate to see it.",
  });
  expect(alertText(row, 3, "sender")).toEqual({ title: "3 new in Launch", body: "From Maya" });
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
    readPreferences: async () => ({ preview: "hidden", sound: true, flash: "idle" }),
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
