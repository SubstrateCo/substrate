import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";

type UpdatesSource = Pick<DesktopUpdatesAPI, "get" | "onChange">;

type DesktopUpdatesStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DesktopUpdateStatus | undefined;
};

const stores = new WeakMap<UpdatesSource, DesktopUpdatesStore>();

export function desktopUpdatesStore(bridge: UpdatesSource): DesktopUpdatesStore {
  const existing = stores.get(bridge);
  if (existing) return existing;
  let status: DesktopUpdateStatus | undefined;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const set = (next: DesktopUpdateStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };
  const start = () => {
    let receivedChange = false;
    const unsubscribe = bridge.onChange((next) => {
      receivedChange = true;
      set(next);
    });
    stop = unsubscribe;
    const isLatestSubscription = () => stop === unsubscribe;
    bridge
      .get()
      .then((initial) => {
        if (!receivedChange && isLatestSubscription()) set(initial);
      })
      .catch(() => {});
  };
  const store: DesktopUpdatesStore = {
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        stop?.();
        stop = undefined;
      };
    },
    getSnapshot: () => status,
  };
  stores.set(bridge, store);
  return store;
}
