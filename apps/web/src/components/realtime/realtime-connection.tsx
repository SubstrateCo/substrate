import type { RealtimeStatus } from "@startup-os/contracts/realtime";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import "@/lib/desktop/realtime";
import { createBrowserRealtime } from "@/lib/realtime/browser";
import { createRealtimeCache } from "@/queries/realtime/cache";

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
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const bridge = window.startupOSRealtime ?? createBrowserRealtime();
    let active = true;
    let statusEpoch = 0;
    let ready: Promise<void> = Promise.resolve();
    let connected = false;
    let hasReady = false;
    const cache = createRealtimeCache({
      queryClient,
      organizationId,
      userId,
      revalidate: () => router.invalidate(),
    });
    const unsubscribe = bridge.onEvent((event) => {
      if (!active) return;
      if (event.type !== "status") {
        const received = event.type === "ready" && hasReady ? cache.resync() : cache.receive(event);
        if (event.type === "ready") {
          hasReady = true;
          ready = received;
        }
        void received.catch(() => {
          if (active) setStatus("disconnected");
        });
      } else if (event.status === "connected") {
        connected = true;
        const epoch = ++statusEpoch;
        void ready.then(
          () => {
            if (active && epoch === statusEpoch) setStatus("connected");
          },
          () => {
            if (active && epoch === statusEpoch) setStatus("disconnected");
          },
        );
      } else {
        connected = false;
        statusEpoch++;
        setStatus(event.status);
        if (event.status === "forbidden") void cache.forbidden().catch(() => {});
      }
    });
    void bridge.connect({ organizationId }).catch(() => {
      if (active) setStatus("disconnected");
    });
    function refresh() {
      if (!active || !connected || document.visibilityState !== "visible") return;
      const epoch = statusEpoch;
      // Ordinary safety refreshes keep drafts mounted. Reconnects clear private caches above.
      void cache.receive({ version: 1, type: "ready" }).then(
        () => {
          if (active && connected && epoch === statusEpoch) setStatus("connected");
        },
        () => {
          if (active && connected && epoch === statusEpoch) setStatus("disconnected");
        },
      );
    }
    const refreshTimer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(refreshTimer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      unsubscribe();
      cache.dispose();
      void bridge.disconnect().catch(() => {});
    };
  }, [organizationId, userId, queryClient, router]);
  let statusText = "Live updates disconnected.";
  if (status === "connecting") statusText = "Reconnecting to live updates…";
  if (status === "forbidden") statusText = "Live updates unavailable. Check workspace access.";
  const notification = (
    <div
      className={`${container ? "absolute" : "fixed"} pointer-events-none inset-x-3 bottom-3 z-50 flex justify-center`}
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
