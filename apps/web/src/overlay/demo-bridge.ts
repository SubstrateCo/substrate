import type {
  MeetingNotification,
  ScreenNotificationEvent,
  ScreenNotificationsBridge,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

const minute = 60_000;

function meeting(
  id: string,
  startsIn: number,
  payload: Partial<MeetingNotification["payload"]>,
): MeetingNotification {
  const now = Date.now();
  const startsAt = now + startsIn * minute;
  return {
    id,
    kind: "meeting",
    priority: "normal",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(startsAt + 30 * minute).toISOString(),
    actions: ["join", "open", "snooze", "dismiss"],
    payload: {
      title: "Meeting",
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + 30 * minute).toISOString(),
      calendarName: "Work",
      color: null,
      phase: startsIn > 0 ? "upcoming" : "started",
      joinable: true,
      ...payload,
    },
  };
}

export function createDemoBridge(): ScreenNotificationsBridge {
  const listeners = new Set<(event: ScreenNotificationEvent) => void>();
  const emit = (event: ScreenNotificationEvent) => {
    for (const listener of listeners) listener(event);
  };
  const cards = [
    meeting("demo:standup", 1, { title: "Product standup", color: "#3b82f6" }),
    meeting("demo:review", -2, {
      title: "Design review: screen notifications and the meeting reminder overlay",
      calendarName: "Alice Chen",
      color: "#16a34a",
    }),
    meeting("demo:interview", 5, {
      title: "Interview with Jordan Lee",
      calendarName: "Recruiting",
      color: "#e11d48",
      joinable: false,
    }),
  ];
  return {
    ready: async () => cards,
    act: async ({ id, action }) => {
      if (action === "snooze" || action === "dismiss" || action === "join")
        emit({ type: "remove", id });
    },
    setInteractive: async () => undefined,
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
