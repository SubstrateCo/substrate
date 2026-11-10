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
  // "stale" means the socket is up but the cache resync after it failed.
  const [status, setStatus] = useState<RealtimeStatus | "stale">("connecting");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const bridge = window.startupOSRealtime ?? createBrowserRealtime();
    let active = true;
    let statusEpoch = 0;
    let ready: Promise<void> = Promise.resolve();
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
          if (active) setStatus("stale");
        });
      } else if (event.status === "connected") {
        const epoch = ++statusEpoch;
        void ready.then(
          () => {
            if (active && epoch === statusEpoch) setStatus("connected");
          },
          () => {
            if (active && epoch === statusEpoch) setStatus("stale");
          },
        );
      } else {
        statusEpoch++;
        setStatus(event.status);
        if (event.status === "forbidden") void cache.forbidden().catch(() => {});
      }
    });
    void bridge.connect({ organizationId }).catch(() => {
      if (active) setStatus("disconnected");
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
