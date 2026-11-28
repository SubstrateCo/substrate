import type { RealtimeStatus } from "@substrate/contracts/realtime";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { useEffect, useReducer, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { realtimeBridge } from "@/lib/desktop/bridges";
import { createBrowserRealtime } from "@/lib/realtime/browser";
import { refreshSession } from "@/queries/auth/session";
import { createRealtimeCache, type RealtimeHealth } from "@/queries/realtime/cache";

type LiveState = { socket: RealtimeStatus; health: RealtimeHealth };

function liveState(state: LiveState, change: Partial<LiveState>): LiveState {
  return { ...state, ...change };
}

function liveStatus({ socket, health }: LiveState): RealtimeStatus {
  if (socket !== "connected") return socket;
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
  const status = liveStatus(live);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const bridge = realtimeBridge() ?? createBrowserRealtime();
    let active = true;
    const controller = new AbortController();
    let connected = false;
    const cache = createRealtimeCache({
      queryClient,
      organizationId,
      userId,
      revalidate: async (shouldRefreshSession) => {
        if (shouldRefreshSession) await refreshSession(queryClient, controller.signal);
        if (active) await router.invalidate();
      },
      onHealth: (health) => {
        if (active) dispatch({ health });
      },
    });
    const unsubscribe = bridge.onEvent((event) => {
      if (!active) return;
      if (event.type !== "status") void cache.receive(event).catch(() => {});
      else {
        connected = event.status === "connected";
        dispatch({ socket: event.status });
        if (event.status === "forbidden") void cache.forbidden().catch(() => {});
      }
    });
    const reconcile = () => {
      if (active && connected) void cache.reconcile().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    void bridge.connect({ organizationId }).catch(() => {
      if (active) dispatch({ socket: "disconnected" });
    });
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      cache.dispose();
      void bridge.disconnect().catch(() => {});
    };
  }, [organizationId, userId, queryClient, router]);
  return (
    <RealtimeContainerContext value={setContainer}>
      {status !== "connected" && <RealtimeStatusNotice status={status} container={container} />}
      {children}
    </RealtimeContainerContext>
  );
}

const statusText: Record<Exclude<RealtimeStatus, "connected">, string> = {
  connecting: "Reconnecting to live updates",
  disconnected: "Live updates disconnected.",
  forbidden: "Live updates unavailable. Check workspace access.",
};

function RealtimeStatusNotice({
  status,
  container,
}: {
  status: Exclude<RealtimeStatus, "connected">;
  container: HTMLDivElement | null;
}) {
  const notification = (
    <div
      // oxlint-disable-next-line shadcn/no-arbitrary-values -- Safe-area clearance is device-dependent; the minimum uses the spacing token.
      className={`${container ? "absolute" : "fixed"} pointer-events-none inset-x-page-outlet bottom-[max(--spacing(3),env(safe-area-inset-bottom))] z-50 flex justify-center`}
    >
      <Alert role="status" className="pointer-events-auto w-max max-w-full min-w-0">
        <AlertDescription className="min-w-0 wrap-anywhere">{statusText[status]}</AlertDescription>
      </Alert>
    </div>
  );
  if (!container) return notification;
  return createPortal(notification, container);
}
