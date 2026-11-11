import type { RealtimeStatus } from "@substrate/contracts/realtime";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { useEffect, useReducer, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { realtimeBridge } from "@/lib/desktop/bridges";
import { createBrowserRealtime } from "@/lib/realtime/browser";
import { createRealtimeCache, type RealtimeHealth } from "@/queries/realtime/cache";

type LiveState = { socket: RealtimeStatus; health: RealtimeHealth };

function liveState(state: LiveState, change: Partial<LiveState>): LiveState {
  return { ...state, ...change };
}

/** A connected socket shows as connected only once the cache refresh after it is done. */
function liveStatus({ socket, health }: LiveState): RealtimeStatus | "stale" {
  if (socket !== "connected") return socket;
  if (health === "stale") return "stale";
  return health === "syncing" ? "connecting" : "connected";
}

export function RealtimeConnection({
  userId,
  organizationId,
  children,
}: {
  userId: string;
  organizationId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [live, dispatch] = useReducer(liveState, { socket: "connecting", health: "fresh" });
  // "stale" means the socket is up but the cache refresh after it failed.
  const status = liveStatus(live);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const bridge = realtimeBridge() ?? createBrowserRealtime();
    let active = true;
    const cache = createRealtimeCache({
      queryClient,
      organizationId,
      userId,
      revalidate: () => router.invalidate(),
      onHealth: (health) => {
        if (active) dispatch({ health });
      },
    });
    const unsubscribe = bridge.onEvent((event) => {
      if (!active) return;
      // The cache reports failed refreshes through onHealth.
      if (event.type !== "status") void cache.receive(event).catch(() => {});
      else {
        dispatch({ socket: event.status });
        if (event.status === "forbidden") void cache.forbidden().catch(() => {});
      }
    });
    void bridge.connect({ organizationId }).catch(() => {
      if (active) dispatch({ socket: "disconnected" });
    });
    return () => {
      active = false;
      unsubscribe();
      cache.dispose();
      void bridge.disconnect().catch(() => {});
    };
  }, [organizationId, userId, queryClient, router]);
  let statusText = "Live updates disconnected.";
  if (status === "connecting") statusText = "Reconnecting to live updates…";
  if (status === "forbidden") statusText = "Live updates unavailable. Check workspace access.";
  if (status === "stale") statusText = "Live updates connected, but some data failed to refresh.";
  const notification = (
    <div
      // Center on the main page outlet when one is rendered; otherwise span the container.
      className={`${container ? "absolute" : "fixed"} pointer-events-none inset-x-page-outlet bottom-3 z-50 flex justify-center`}
    >
      <Alert role="status" className="pointer-events-auto w-max max-w-full">
        <AlertDescription>{statusText}</AlertDescription>
      </Alert>
    </div>
  );
  return (
    <RealtimeContainerContext value={setContainer}>
      {status !== "connected" && (container ? createPortal(notification, container) : notification)}
      {children}
    </RealtimeContainerContext>
  );
}
