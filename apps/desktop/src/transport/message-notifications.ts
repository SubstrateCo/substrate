import type {
  AccountNotificationPreferences,
  NotificationFlashMode,
} from "@substrate/contracts/notifications/preferences";
import type { RealtimeUpdate } from "@substrate/contracts/realtime";

export interface MessageNotice {
  id: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
  alert: boolean;
  messageId: string | null;
  conversationId: string | null;
  entityId: string | null;
  projectEntityId: string | null;
  title: string;
  actorName: string | null;
  excerpt: string | null;
  sourceName: string | null;
}
export type AlertPreferences = Pick<AccountNotificationPreferences, "preview" | "sound" | "flash">;
export type NoticeTarget =
  | { kind: "message"; organizationId: string; conversationId: string; messageId: string }
  | { kind: "task"; organizationId: string; projectEntityId: string; taskEntityId: string }
  | { kind: "feed"; organizationId: string };
export interface NativeAlert {
  title: string;
  body: string;
  silent: boolean;
  flash: NotificationFlashMode;
}

const defaultPreferences: AlertPreferences = { preview: "hidden", sound: true, flash: "idle" };
const burstLimit = 3;
const burstWindow = 60_000;
const soundWindow = 10_000;

const groupOf = (row: MessageNotice) =>
  row.conversationId ? `conversation:${row.conversationId}` : `entity:${row.entityId}`;

function targetOf(row: MessageNotice, organizationId: string): NoticeTarget | null {
  if (row.conversationId && row.messageId && ["message", "mention", "reply"].includes(row.kind))
    return {
      kind: "message",
      organizationId,
      conversationId: row.conversationId,
      messageId: row.messageId,
    };
  if (row.kind === "assignment" && row.entityId && row.projectEntityId)
    return {
      kind: "task",
      organizationId,
      projectEntityId: row.projectEntityId,
      taskEntityId: row.entityId,
    };
  return null;
}

export function noticeURL(target: NoticeTarget, rendererURL: string) {
  const paths = { message: "/messages", task: "/tasks", feed: "/notifications" };
  const destination = new URL(paths[target.kind], rendererURL);
  destination.searchParams.set("workspaceId", target.organizationId);
  if (target.kind === "message") {
    destination.searchParams.set("conversationId", target.conversationId);
    destination.searchParams.set("messageId", target.messageId);
  } else if (target.kind === "task") {
    destination.searchParams.set("projectId", target.projectEntityId);
    destination.searchParams.set("taskId", target.taskEntityId);
  }
  return destination.href;
}

function alertTitle(row: MessageNotice, count: number, hidden: boolean) {
  if (count > 1)
    return hidden
      ? `${count} new notifications`
      : `${count} new in ${row.sourceName ?? "Substrate"}`;
  if (row.kind === "assignment")
    return hidden ? "Task assigned to you" : `Task assigned: ${row.title}`;
  if (hidden || !row.sourceName) return row.title;
  return `${row.title} in ${row.sourceName}`;
}

export function alertText(row: MessageNotice, count: number, preview: AlertPreferences["preview"]) {
  const title = alertTitle(row, count, preview === "hidden");
  if (preview === "hidden") return { title, body: "Open Substrate to see it." };
  const sender = row.actorName ?? "Someone";
  if (preview === "sender" || !row.excerpt) return { title, body: `From ${sender}` };
  return { title, body: `${sender}: ${row.excerpt}` };
}

export function createMessageNotifications(options: {
  read(organizationId: string): Promise<MessageNotice[]>;
  readPreferences(): Promise<AlertPreferences>;
  sessionKey(): string;
  show(alert: NativeAlert, onClick: () => Promise<void>): () => void;
  open(target: NoticeTarget): void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let organizationId: string | null = null;
  let sessionKey = "";
  let seen = new Set<string>();
  let newest = "";
  let initialized = false;
  let preferences = defaultPreferences;
  const resume = new Map<string, string>();
  const groups = new Map<string, { dismiss: () => void; ids: Set<string> }>();
  let shownAt: number[] = [];
  let soundAt = -Infinity;
  let work = Promise.resolve();
  const current = (epoch: number) => generation === epoch && options.sessionKey() === sessionKey;
  const resumeKey = () => `${sessionKey}\n${organizationId}`;
  function closeAll() {
    for (const group of groups.values()) group.dismiss();
    groups.clear();
  }
  function disconnect() {
    generation++;
    if (organizationId && newest) resume.set(resumeKey(), newest);
    organizationId = null;
    seen.clear();
    newest = "";
    initialized = false;
    shownAt = [];
    closeAll();
  }
  function display(
    key: string,
    ids: Set<string>,
    text: { title: string; body: string },
    click: () => Promise<void>,
  ) {
    const replaced = groups.get(key);
    replaced?.dismiss();
    // The operating system plays every alert's sound and never throttles. Only the first alert in
    // a quiet window plays one; an update to an open alert stays silent.
    const quiet = !replaced && now() - soundAt >= soundWindow;
    const silent = !preferences.sound || !quiet;
    if (!silent) soundAt = now();
    const dismiss = options.show(
      { ...text, silent, flash: replaced ? "never" : preferences.flash },
      click,
    );
    groups.set(key, { dismiss, ids });
    shownAt.push(now());
  }
  function summary(id: string, epoch: number, ids: Set<string>) {
    const count = ids.size;
    display(
      "summary",
      ids,
      {
        title: count === 1 ? "1 new notification" : `${count} new notifications`,
        body: count === 1 ? "Open Substrate to see it." : "Open Substrate to see them.",
      },
      async () => {
        if (current(epoch)) options.open({ kind: "feed", organizationId: id });
      },
    );
  }
  function baseline(id: string, epoch: number, rows: MessageNotice[]) {
    const since = sessionKey && resume.get(resumeKey());
    seen = new Set(rows.map((row) => row.id));
    newest = rows.reduce((at, row) => (row.createdAt > at ? row.createdAt : at), "");
    initialized = true;
    if (!since) return;
    const missed = rows.filter(
      (row) => row.alert && !row.readAt && row.createdAt > since && targetOf(row, id),
    );
    if (missed.length) summary(id, epoch, new Set(missed.map((row) => row.id)));
  }
  async function refreshPreferences(epoch: number) {
    const read = await options.readPreferences().catch(() => null);
    if (read && current(epoch)) preferences = read;
  }
  async function connect(id: string | null) {
    disconnect();
    organizationId = id;
    sessionKey = options.sessionKey();
    const epoch = generation;
    if (!id) return;
    work = Promise.all([options.read(id), refreshPreferences(epoch)])
      .then(([rows]) => {
        if (current(epoch)) baseline(id, epoch, rows);
      })
      .catch(() => {});
    await work;
  }
  function receive(event: RealtimeUpdate): Promise<void> {
    if (event.type === "status" && event.status === "forbidden") disconnect();
    if (event.type === "change" && (event.domain === "access" || event.domain === "session")) {
      const id = organizationId;
      return connect(id);
    }
    if (event.type === "change" && event.domain === "notification-preferences")
      return refreshPreferences(generation);
    if (event.type !== "change" || event.domain !== "notifications") return Promise.resolve();
    if (!organizationId || event.organizationId !== organizationId) return Promise.resolve();
    return reconcile();
  }
  function reconcile(): Promise<void> {
    if (!organizationId) return Promise.resolve();
    const id = organizationId;
    const epoch = generation;
    work = work
      .then(async () => {
        if (!current(epoch)) return;
        const rows = await options.read(id);
        if (!current(epoch)) return;
        if (!initialized) {
          baseline(id, epoch, rows);
          return;
        }
        const unread = new Set(rows.flatMap((row) => (row.readAt ? [] : [row.id])));
        const arrivals = [...rows]
          .reverse()
          .filter((row) => !seen.has(row.id) && row.createdAt >= newest)
          .filter((row) => row.alert && !row.readAt && targetOf(row, id));
        shownAt = shownAt.filter((at) => now() - at < burstWindow);
        const burst =
          new Set(arrivals.map(groupOf)).size > burstLimit ||
          (arrivals.length > 0 && shownAt.length >= burstLimit);
        if (burst) {
          const ids = new Set(arrivals.map((row) => row.id));
          for (const [key, group] of groups) {
            for (const groupId of group.ids) if (unread.has(groupId)) ids.add(groupId);
            if (key !== "summary") {
              group.dismiss();
              groups.delete(key);
            }
          }
          summary(id, epoch, ids);
        } else {
          const batches = new Map<string, { row: MessageNotice; ids: Set<string> }>();
          for (const row of arrivals) {
            const key = groups.has("summary") ? "summary" : groupOf(row);
            const ids = batches.get(key)?.ids ?? new Set(groups.get(key)?.ids ?? []);
            batches.set(key, { row, ids: ids.add(row.id) });
          }
          for (const [key, { row, ids }] of batches) {
            if (key === "summary") {
              summary(id, epoch, ids);
              continue;
            }
            const target = targetOf(row, id)!;
            display(key, ids, alertText(row, ids.size, preferences.preview), async () => {
              if (!current(epoch)) return;
              const latest = await options.read(id);
              if (current(epoch) && latest.some((item) => item.id === row.id)) options.open(target);
            });
          }
        }
        for (const [key, group] of groups) {
          for (const groupId of group.ids) if (!unread.has(groupId)) group.ids.delete(groupId);
          if (group.ids.size) continue;
          group.dismiss();
          groups.delete(key);
        }
        newest = rows.reduce((at, row) => (row.createdAt > at ? row.createdAt : at), newest);
        seen = new Set(rows.map((row) => row.id));
      })
      .catch(() => {});
    return work;
  }
  return { connect, disconnect, receive, reconcile };
}
