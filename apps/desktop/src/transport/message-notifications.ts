import type { RealtimeUpdate } from "@substrate/contracts/realtime";

export interface MessageNotice {
  id: string;
  messageId: string | null;
  conversationId: string | null;
  kind: string;
  createdAt: string;
  readAt: string | null;
}
type Target = { organizationId: string; conversationId: string; messageId: string };

// Hints contain no content. Every display and click reads the recipient's current, access-filtered feed.
export function createMessageNotifications(options: {
  read(organizationId: string): Promise<MessageNotice[]>;
  sessionKey(): string;
  show(onClick: () => Promise<void>): () => void;
  open(target: Target): void;
}) {
  let generation = 0;
  let organizationId: string | null = null;
  let sessionKey = "";
  let seen = new Set<string>();
  let newest = "";
  let initialized = false;
  const close = new Set<() => void>();
  let work = Promise.resolve();
  const current = (epoch: number) => generation === epoch && options.sessionKey() === sessionKey;
  function disconnect() {
    generation++;
    organizationId = null;
    seen.clear();
    newest = "";
    initialized = false;
    for (const dismiss of close) dismiss();
    close.clear();
  }
  function baseline(rows: MessageNotice[]) {
    seen = new Set(rows.map((row) => row.id));
    newest = rows.reduce((at, row) => (row.createdAt > at ? row.createdAt : at), "");
    initialized = true;
  }
  async function connect(id: string | null) {
    disconnect();
    organizationId = id;
    sessionKey = options.sessionKey();
    const epoch = generation;
    if (!id) return;
    // Baseline is intentionally quiet: signing in and reconnecting do not replay old notifications.
    work = options
      .read(id)
      .then((rows) => {
        if (current(epoch)) {
          baseline(rows);
        }
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
          baseline(rows);
          return;
        }
        for (const row of [...rows].reverse()) {
          if (seen.has(row.id) || row.createdAt < newest) continue;
          seen.add(row.id);
          if (row.readAt) continue;
          if (
            !row.conversationId ||
            !row.messageId ||
            !["message", "mention", "reply"].includes(row.kind)
          )
            continue;
          const target = {
            organizationId: id,
            conversationId: row.conversationId,
            messageId: row.messageId,
          };
          const dismiss = options.show(async () => {
            if (!current(epoch)) return;
            const latest = await options.read(id);
            if (
              current(epoch) &&
              latest.some(
                (item) =>
                  item.id === row.id &&
                  item.messageId === target.messageId &&
                  item.conversationId === target.conversationId,
              )
            )
              options.open(target);
          });
          close.add(dismiss);
          if (close.size > 20) {
            const oldest = close.values().next().value;
            if (oldest) {
              oldest();
              close.delete(oldest);
            }
          }
        }
        newest = rows.reduce((at, row) => (row.createdAt > at ? row.createdAt : at), newest);
        seen = new Set(rows.map((row) => row.id));
      })
      .catch(() => {});
    return work;
  }
  return { connect, disconnect, receive, reconcile };
}
