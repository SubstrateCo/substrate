import { calendarSyncIntervalMs } from "@substrate/contracts/calendar";
import type { MeetingNotification } from "@substrate/contracts/desktop/screen-notifications-ipc";
import type { RealtimeUpdate } from "@substrate/contracts/realtime";

import type { CalendarFeedEvent } from "../transport/calendar-feed.ts";
import { joinableConferenceURL } from "./conference-url.ts";
import type { ReminderStore } from "./reminder-store.ts";
import type { ScreenNotificationCenter } from "./screen-notification-center.ts";
import { systemClock, type CancelTimer, type Clock } from "./timers.ts";

const minute = 60_000;
const pastWindow = 15 * minute;
const futureWindow = 12 * 60 * minute;
/** A card stays at most this long after the meeting starts. */
const startedLifetime = 10 * minute;
/** A meeting first seen later than this after its start gets no card, such as after a wake. */
const lateLimit = 5 * minute;
const snoozeAfterStart = minute;
const heartbeat = 30_000;
const hintDebounce = 2_000;

interface Meeting {
  id: string;
  entityId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  expiresAt: number;
  calendarName: string;
  color: string | null;
  /** The allowlisted conference URL, or null. */
  joinURL: string | null;
}

export interface CalendarEventTarget {
  organizationId: string;
  eventId: string;
  /** The meeting's local date, YYYY-MM-DD. */
  date: string;
}

export function localDate(at: number) {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function qualifies(event: CalendarFeedEvent, now: number) {
  return (
    event.kind === "default" &&
    !event.allDay &&
    event.status !== "cancelled" &&
    event.selfResponseStatus !== "declined" &&
    Date.parse(event.endsAt) > now
  );
}

function meeting(event: CalendarFeedEvent): Meeting {
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  return {
    id: `meeting:${event.entityId}:${new Date(startsAt).toISOString()}`,
    entityId: event.entityId,
    title: event.title.trim().slice(0, 500) || "Untitled meeting",
    startsAt,
    endsAt,
    expiresAt: Math.min(endsAt, startsAt + startedLifetime),
    calendarName: event.calendarName.slice(0, 200),
    color: event.color && event.color.length <= 32 ? event.color : null,
    joinURL: joinableConferenceURL(event.conferenceUrl),
  };
}

/**
 * Posts a card before each of the viewer's meetings in the active organization, then updates it
 * when the meeting starts. Like message notifications, every card comes from the viewer's current,
 * access-checked calendar feed; a new session or organization clears everything.
 */
export function createMeetingReminders(options: {
  read(
    organizationId: string,
    range: { from: Date; until: Date },
  ): Promise<CalendarFeedEvent[] | null>;
  sessionKey(): string;
  center: Pick<ScreenNotificationCenter, "post" | "update" | "retract" | "register">;
  store: ReminderStore;
  openExternal(url: string): void;
  openEvent(target: CalendarEventTarget): void;
  clock?: Clock;
}) {
  const clock = options.clock ?? systemClock;
  const { center, store } = options;
  let generation = 0;
  let organizationId: string | null = null;
  let sessionKey = "";
  let meetings = new Map<string, Meeting>();
  /** Card ID → the last card sent to the center, serialized. */
  const shown = new Map<string, string>();
  /** IDs that had a card in this session, so a snooze can bring back a late card. */
  const seen = new Set<string>();
  const createdAt = new Map<string, number>();
  let work = Promise.resolve();
  let due: CancelTimer | undefined;
  let pulse: CancelTimer | undefined;
  let poll: CancelTimer | undefined;
  let hint: CancelTimer | undefined;

  const current = (epoch: number) => generation === epoch && options.sessionKey() === sessionKey;

  function stopTimers() {
    for (const cancel of [due, pulse, poll, hint]) cancel?.();
    due = pulse = poll = hint = undefined;
  }

  function retractAll() {
    for (const id of shown.keys()) center.retract(id);
    shown.clear();
  }

  function disconnect() {
    generation++;
    organizationId = null;
    stopTimers();
    retractAll();
    meetings = new Map<string, Meeting>();
    seen.clear();
    createdAt.clear();
  }

  function card(item: Meeting, phase: "upcoming" | "started", now: number): MeetingNotification {
    const created = createdAt.get(item.id) ?? now;
    createdAt.set(item.id, created);
    const joinable = item.joinURL !== null;
    return {
      id: item.id,
      kind: "meeting",
      priority: "normal",
      createdAt: new Date(created).toISOString(),
      expiresAt: new Date(item.expiresAt).toISOString(),
      payload: {
        title: item.title,
        startsAt: new Date(item.startsAt).toISOString(),
        endsAt: new Date(item.endsAt).toISOString(),
        calendarName: item.calendarName,
        color: item.color,
        phase,
        joinable,
      },
      actions: joinable ? ["join", "open", "snooze", "dismiss"] : ["open", "snooze", "dismiss"],
    };
  }

  function hide(id: string) {
    if (shown.delete(id)) center.retract(id);
  }

  function phaseAt(item: Meeting, now: number, lead: number) {
    if (now >= item.expiresAt || now < item.startsAt - lead) return null;
    return now < item.startsAt ? "upcoming" : "started";
  }

  /** Brings every card in line with the clock, then waits for the next change. */
  function evaluate() {
    due?.();
    due = undefined;
    if (!organizationId) return;
    if (options.sessionKey() !== sessionKey) {
      disconnect();
      return;
    }
    const { enabled, leadMinutes } = store.settings();
    if (!enabled) {
      retractAll();
      return;
    }
    const now = clock.now();
    const lead = leadMinutes * minute;
    let next = Infinity;
    const later = (at: number) => {
      if (at > now) next = Math.min(next, at);
    };
    for (const item of meetings.values()) {
      const snoozed = store.snoozedUntil(item.id);
      const late = !seen.has(item.id) && now - item.startsAt >= lateLimit;
      const suppressed = snoozed !== null || store.isDismissed(item.id);
      const phase = phaseAt(item, now, lead);
      if (!phase || late || suppressed) {
        hide(item.id);
      } else {
        const value = card(item, phase, now);
        const signature = JSON.stringify(value);
        const previous = shown.get(item.id);
        if (previous !== signature) {
          if (previous) center.update(value);
          else center.post(value);
          shown.set(item.id, signature);
        }
        seen.add(item.id);
      }
      later(item.startsAt - lead);
      later(item.startsAt);
      later(item.expiresAt);
      if (snoozed !== null) later(snoozed);
    }
    if (next !== Infinity) due = clock.setTimeout(evaluate, next - now);
  }

  function beat() {
    // Catches wall-clock changes that a single long timer would miss.
    evaluate();
    pulse = clock.setTimeout(beat, heartbeat);
  }

  function schedulePoll() {
    poll?.();
    poll = clock.setTimeout(() => {
      void refresh();
      schedulePoll();
    }, calendarSyncIntervalMs);
  }

  function apply(events: CalendarFeedEvent[] | null) {
    const now = clock.now();
    const next = new Map<string, Meeting>();
    for (const event of events ?? []) {
      if (!qualifies(event, now)) continue;
      const item = meeting(event);
      next.set(item.id, item);
    }
    // A removed, cancelled, declined, or moved meeting loses its card.
    for (const id of shown.keys()) if (!next.has(id)) hide(id);
    meetings = next;
    evaluate();
  }

  /** Rereads the calendar. Reads run one at a time and drop results from an older session. */
  function refresh(): Promise<void> {
    evaluate();
    const id = organizationId;
    if (!id) return Promise.resolve();
    const epoch = generation;
    work = work
      .then(async () => {
        if (!current(epoch)) return;
        if (!store.settings().enabled) {
          apply(null);
          return;
        }
        const now = clock.now();
        const events = await options.read(id, {
          from: new Date(now - pastWindow),
          until: new Date(now + futureWindow),
        });
        if (current(epoch)) apply(events);
      })
      .catch(() => {});
    return work;
  }

  function connect(id: string | null): Promise<void> {
    const key = options.sessionKey();
    if (!id || id !== organizationId || key !== sessionKey) {
      disconnect();
      organizationId = id;
      sessionKey = key;
      if (!id) return Promise.resolve();
      beat();
      schedulePoll();
    }
    return refresh();
  }

  function receive(event: RealtimeUpdate): Promise<void> {
    if (event.type === "status") {
      // A transient disconnect keeps the cards; a rejected session clears them.
      if (event.status === "forbidden") disconnect();
      return Promise.resolve();
    }
    if (event.type === "ready") return refresh();
    if (event.domain === "access" || event.domain === "session") return refresh();
    if (event.domain === "context" && organizationId && event.organizationId === organizationId) {
      hint?.();
      hint = clock.setTimeout(() => {
        hint = undefined;
        void refresh();
      }, hintDebounce);
    }
    return Promise.resolve();
  }

  const target = (notification: MeetingNotification) => {
    const item = meetings.get(notification.id);
    return item && organizationId && shown.has(item.id) ? item : undefined;
  };
  function dismiss(item: Meeting) {
    store.dismiss(item.id, item.expiresAt);
    hide(item.id);
    evaluate();
  }
  center.register("meeting", {
    join(notification) {
      const item = target(notification);
      // Main opens only the URL it read itself, and checks it again before opening.
      const url = item && joinableConferenceURL(item.joinURL);
      if (!item || !url) return;
      options.openExternal(url);
      dismiss(item);
    },
    open(notification) {
      const item = target(notification);
      if (!item || !organizationId) return;
      options.openEvent({
        organizationId,
        eventId: item.entityId,
        date: localDate(item.startsAt),
      });
      // The meeting is open in the main window, so its card is done.
      dismiss(item);
    },
    snooze(notification) {
      const item = target(notification);
      if (!item) return;
      const now = clock.now();
      const until = now < item.startsAt ? item.startsAt : now + snoozeAfterStart;
      if (until >= item.expiresAt) {
        dismiss(item);
        return;
      }
      store.snooze(item.id, until);
      hide(item.id);
      evaluate();
    },
    dismiss(notification) {
      const item = target(notification);
      if (item) dismiss(item);
    },
  });

  return { connect, disconnect, receive, refresh };
}
