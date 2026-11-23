import type {
  ScreenNotification,
  ScreenNotificationsBridge,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { useCallback, useEffect, useRef } from "react";

import { screenNotificationView } from "./screen-notification-views";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

/**
 * Shows main's screen notifications as cards in the shared toast stack, top-right. The window lets
 * clicks through to the desktop until the pointer is over a card.
 */
export function ScreenNotificationHost({ bridge }: { bridge: ScreenNotificationsBridge }) {
  const interactive = useRef(false);
  const setInteractive = useCallback(
    (value: boolean) => {
      if (interactive.current === value) return;
      interactive.current = value;
      void bridge.setInteractive(value);
    },
    [bridge],
  );

  useEffect(() => {
    const shown = new Set<string>();
    // An event can arrive before `ready` answers. It is newer than the snapshot, so it wins.
    const changed = new Set<string>();
    let active = true;

    const show = (notification: ScreenNotification) => {
      const View = screenNotificationView(notification);
      const { id } = notification;
      shown.add(id);
      toast.custom(
        () => (
          <View
            notification={notification}
            onAction={(action) => void bridge.act({ id, action })}
          />
        ),
        // Main owns each card's life: no timeout, and no swipe that hides it without telling main.
        { id, duration: Number.POSITIVE_INFINITY, dismissible: false },
      );
    };
    const remove = (id: string) => {
      shown.delete(id);
      toast.dismiss(id);
      // The stack shrank, so the pointer may be over empty glass. The next move over a card restores it.
      setInteractive(false);
    };

    const unsubscribe = bridge.onEvent((event) => {
      if (event.type === "upsert") {
        changed.add(event.notification.id);
        show(event.notification);
      } else {
        changed.add(event.id);
        remove(event.id);
      }
    });
    void bridge.ready().then((notifications) => {
      if (!active) return;
      // The newest toast sits on top, so add the list backwards: main's first card ends up on top.
      for (const notification of [...notifications].reverse())
        if (!changed.has(notification.id)) show(notification);
    });

    return () => {
      active = false;
      unsubscribe();
      for (const id of shown) toast.dismiss(id);
      setInteractive(false);
    };
  }, [bridge, setInteractive]);

  return (
    // Pointer events bubble from the fixed toast list, so this wrapper sees them without a box.
    <div
      onPointerEnter={() => setInteractive(true)}
      onPointerMove={() => setInteractive(true)}
      onPointerLeave={() => setInteractive(false)}
    >
      <Toaster position="top-right" expand visibleToasts={3} offset={24} mobileOffset={24} />
    </div>
  );
}
