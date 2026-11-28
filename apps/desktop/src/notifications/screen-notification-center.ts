import {
  screenNotification,
  type ScreenNotification,
  type ScreenNotificationAction,
  type ScreenNotificationEvent,
  type ScreenNotificationKind,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { systemClock, type CancelTimer, type Clock } from "./timers.ts";

export interface ScreenNotificationSink {
  emit(event: ScreenNotificationEvent): void;
  show(): void;
  hide(): void;
}

export type ScreenNotificationHandlers<N extends ScreenNotification = ScreenNotification> = Partial<
  Record<ScreenNotificationAction, (notification: N) => void | Promise<void>>
>;

const visibleLimit = 3;
const rank = { high: 0, normal: 1 } as const;
const order = (a: ScreenNotification, b: ScreenNotification) =>
  rank[a.priority] - rank[b.priority] || Date.parse(a.createdAt) - Date.parse(b.createdAt);

export function createScreenNotificationCenter(options: {
  sink: ScreenNotificationSink;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  const cards = new Map<string, ScreenNotification>();
  let visible = new Map<string, ScreenNotification>();
  const registry = new Map<ScreenNotificationKind, ScreenNotificationHandlers>();
  let expiry: CancelTimer | undefined;

  function render() {
    const now = clock.now();
    for (const [id, card] of cards) if (Date.parse(card.expiresAt) <= now) cards.delete(id);
    const next = new Map(
      [...cards.values()]
        .sort(order)
        .slice(0, visibleLimit)
        .map((card) => [card.id, card]),
    );
    const wasVisible = visible.size > 0;
    if (!wasVisible && next.size) options.sink.show();
    for (const id of visible.keys()) if (!next.has(id)) options.sink.emit({ type: "remove", id });
    for (const [id, card] of next)
      if (visible.get(id) !== card) options.sink.emit({ type: "upsert", notification: card });
    visible = next;
    if (wasVisible && !next.size) options.sink.hide();
    expiry?.();
    expiry = undefined;
    if (!cards.size) return;
    const soonest = Math.min(...[...cards.values()].map((card) => Date.parse(card.expiresAt)));
    expiry = clock.setTimeout(render, soonest - now);
  }

  function upsert(value: ScreenNotification, keepCreatedAt: boolean) {
    const card = screenNotification.parse(value);
    const existing = cards.get(card.id);
    cards.set(
      card.id,
      keepCreatedAt && existing ? { ...card, createdAt: existing.createdAt } : card,
    );
    render();
  }

  return {
    register<K extends ScreenNotificationKind>(
      kind: K,
      handlers: ScreenNotificationHandlers<Extract<ScreenNotification, { kind: K }>>,
    ) {
      // SAFETY: act() dispatches only cards whose kind selected these handlers.
      registry.set(kind, handlers as ScreenNotificationHandlers);
    },
    post(card: ScreenNotification) {
      upsert(card, false);
    },
    update(card: ScreenNotification) {
      upsert(card, true);
    },
    retract(id: string) {
      if (cards.delete(id)) render();
    },
    list() {
      return [...visible.values()];
    },
    async act(id: string, action: ScreenNotificationAction) {
      const card = visible.get(id);
      if (!card || !card.actions.includes(action)) return;
      await registry.get(card.kind)?.[action]?.(card);
    },
  };
}
export type ScreenNotificationCenter = ReturnType<typeof createScreenNotificationCenter>;
