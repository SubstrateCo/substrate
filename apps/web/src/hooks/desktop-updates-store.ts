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

/**
 * The main process owns update status and pushes every change. All views share one subscription
 * per bridge: it reads the status once when the first view subscribes, then listens.
 */
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
    let changed = false;
    const unsubscribe = bridge.onChange((next) => {
      changed = true;
      set(next);
    });
    stop = unsubscribe;
    bridge
      .get()
      // A change that arrived while this read was in flight is newer, and a read from an
      // earlier subscription must not replace what a later one received.
      .then((initial) => {
        if (!changed && stop === unsubscribe) set(initial);
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
