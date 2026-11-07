import type { RealtimeStatus } from "@startup-os/contracts/realtime";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { useEffect, useState, type ReactNode } from "react";

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
  useEffect(() => {
    const bridge = window.startupOSRealtime ?? createBrowserRealtime();
    let active = true;
    let statusEpoch = 0;
    let ready: Promise<void> = Promise.resolve();
    const cache = createRealtimeCache({
      queryClient,
      organizationId,
      userId,
      revalidate: () => router.invalidate(),
    });
    const unsubscribe = bridge.onEvent((event) => {
      if (!active) return;
      if (event.type !== "status") {
        const received = cache.receive(event);
        if (event.type === "ready") ready = received;
        void received.catch(() => {
          if (active) setStatus("disconnected");
        });
      } else if (event.status === "connected") {
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
  return (
    <>
      {status !== "connected" && (
        <Alert role="status" className="fixed bottom-3 left-1/2 z-50 w-auto -translate-x-1/2">
          <AlertDescription>{statusText}</AlertDescription>
        </Alert>
      )}
      {children}
    </>
  );
}
