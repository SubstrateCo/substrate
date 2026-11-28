import { focusManager, onlineManager, useQueryClient } from "@tanstack/react-query";

import { useEffect, useLayoutEffect, useState } from "react";
import { AppState } from "react-native";

import { authClient } from "../api/auth-client";
import { onUnauthorized } from "../api/client";
import { createMobileRealtime } from "../api/realtime";
import { getMessageTarget } from "../features/messaging/api/context";
import { listMessages } from "../features/messaging/api/messages";
import { clearPrivateQueries, watchAccessFailures } from "../queries/privacy";
import { createRealtimeCache } from "../queries/realtime/cache";
import { resetPrivateState } from "./private-state";
import { changeRevalidatesSession } from "./session-events";
import { addNetworkStateListener } from "expo-network";

export function MobileLifecycle({
  userId,
  organizationId,
  revalidate,
}: {
  userId: string;
  organizationId: string | null;
  revalidate: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [realtime] = useState(createMobileRealtime);

  useLayoutEffect(() => {
    clearPrivateQueries(queryClient);
    return () => {
      clearPrivateQueries(queryClient);
      resetPrivateState();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [userId, organizationId, queryClient]);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let active = AppState.currentState === "active";
    const cache = createRealtimeCache({
      queryClient,
      userId,
      organizationId,
      loadMessages: listMessages,
      loadTarget: getMessageTarget,
    });
    const isCurrent = (epoch: number) => !disposed && epoch === generation && active;
    function clear() {
      clearPrivateQueries(queryClient);
      resetPrivateState();
    }
    async function connect() {
      const current = ++generation;
      await realtime.disconnect();
      try {
        const response = await authClient.getSession({ query: { disableCookieCache: true } });
        if (!isCurrent(current)) return;
        const sameAccount = response.data?.user.emailVerified && response.data.user.id === userId;
        const sameWorkspace =
          (response.data?.session.activeOrganizationId ?? null) === organizationId;
        if (response.error || !sameAccount || !sameWorkspace) {
          clear();
          await revalidate();
          return;
        }
        authClient.hydrateSession(response.data);
        if (!isCurrent(current)) return;
        focusManager.setFocused(true);
        await realtime.connect({ organizationId });
      } catch {
        if (!disposed && current === generation) clear();
      }
    }
    const unsubscribeAuth = onUnauthorized(() => {
      generation++;
      void realtime.disconnect();
      clear();
      void revalidate().catch(() => {});
    });
    const unsubscribeAccessFailures = watchAccessFailures(queryClient);
    const unsubscribeRealtime = realtime.onEvent((event) => {
      if (event.type === "status" && event.status === "forbidden") {
        generation++;
        clear();
        void realtime.disconnect();
        void revalidate().catch(() => {});
      } else if (event.type === "ready") {
        void cache.recheck();
      } else if (event.type === "change" && event.domain === "session") {
        void connect();
      } else if (event.type === "change" && event.domain === "access") {
        void cache.recheck();
        void revalidate().catch(() => {});
      } else if (event.type === "change") {
        cache.receive(event);
        if (changeRevalidatesSession(event.domain)) void revalidate().catch(() => {});
      }
    });
    const appSubscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      focusManager.setFocused(false);
      if (active) void connect();
      else {
        generation++;
        void realtime.disconnect();
      }
    });
    const networkSubscription = addNetworkStateListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      onlineManager.setOnline(online);
      if (online && active) void connect();
      else {
        generation++;
        void realtime.disconnect();
      }
    });
    focusManager.setFocused(false);
    if (active) void connect();
    return () => {
      disposed = true;
      generation++;
      appSubscription.remove();
      networkSubscription.remove();
      unsubscribeAuth();
      unsubscribeAccessFailures();
      unsubscribeRealtime();
      cache.dispose();
      void realtime.disconnect();
    };
  }, [userId, organizationId, queryClient, realtime, revalidate]);
  return null;
}
