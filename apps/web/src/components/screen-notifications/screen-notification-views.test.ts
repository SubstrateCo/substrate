import type { ScreenNotification } from "@substrate/contracts/desktop/screen-notifications-ipc";

import { MeetingCard } from "./meeting-card";
import { screenNotificationView } from "./screen-notification-views";
import { describe, expect, test } from "bun:test";

const meeting: ScreenNotification = {
  id: "meeting:1:2026-11-22T10:00:00.000Z",
  kind: "meeting",
  priority: "normal",
  createdAt: "2026-11-22T09:59:00.000Z",
  expiresAt: "2026-11-22T10:30:00.000Z",
  actions: ["open", "dismiss"],
  payload: {
    title: "Design review",
    startsAt: "2026-11-22T10:00:00.000Z",
    endsAt: "2026-11-22T10:30:00.000Z",
    calendarName: "Work",
    color: null,
    phase: "upcoming",
    joinable: false,
  },
};

describe("screenNotificationView", () => {
  test("shows a meeting with the meeting card", () => {
    expect(screenNotificationView(meeting)).toBe(MeetingCard);
  });
});
