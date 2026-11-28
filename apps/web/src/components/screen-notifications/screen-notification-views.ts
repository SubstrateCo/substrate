import type {
  ScreenNotification,
  ScreenNotificationAction,
  ScreenNotificationKind,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import type { ComponentType } from "react";

import { MeetingCard } from "./meeting-card";

export type ScreenNotificationViewProps<N extends ScreenNotification = ScreenNotification> = {
  notification: N;
  onAction: (action: ScreenNotificationAction) => void;
};

type ScreenNotificationViews = {
  [K in ScreenNotificationKind]: ComponentType<
    ScreenNotificationViewProps<Extract<ScreenNotification, { kind: K }>>
  >;
};

const screenNotificationViews: ScreenNotificationViews = {
  meeting: MeetingCard,
};

export function screenNotificationView(
  notification: ScreenNotification,
): ComponentType<ScreenNotificationViewProps> {
  // SAFETY: The registry maps each kind to the view of that kind, so the view accepts this notification.
  return screenNotificationViews[notification.kind] as ComponentType<ScreenNotificationViewProps>;
}
