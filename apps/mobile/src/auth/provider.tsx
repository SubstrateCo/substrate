import { useQueryClient } from "@tanstack/react-query";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, View } from "react-native";

import { authClient, type Session } from "../api/auth-client";
import { clearPrivateQueries } from "../queries/privacy";
import { MobileLifecycle } from "./lifecycle";
import { resetPrivateState } from "./private-state";
import { createSessionRevalidator, readUncachedSession } from "./revalidation";
import { Toaster } from "@/components/ui/sonner";
import { resetToasts } from "@/lib/toast";
import { PortalHost } from "@rn-primitives/portal";
import { LayoutAnimationConfig } from "react-native-reanimated";

// oxlint-disable-next-line deslop/no-reexports-outside-entrypoints -- The auth provider is the shared lifecycle boundary used by local draft stores.
export { onPrivateStateReset } from "./private-state";

interface AuthContextValue {
  session: Session | null;
  isPending: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setActiveOrganization: (organizationId: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, isPending } = authClient.useSession();
  const session = data ?? null;
  const identity = session
    ? `${session.user.id}:${session.session.activeOrganizationId ?? ""}`
    : "";
  const [clearedIdentity, setClearedIdentity] = useState(identity);
  const [changing, setChanging] = useState(false);
  const [blockedRealtimeIdentity, setBlockedRealtimeIdentity] = useState<string | null>(null);
  const clear = useCallback(() => {
    resetToasts();
    clearPrivateQueries(client);
    resetPrivateState();
  }, [client]);
  useLayoutEffect(() => {
    clear();
    // oxlint-disable-next-line react/set-state-in-effect -- Release children only after the external private query cache has been cleared for this identity.
    setClearedIdentity(identity);
  }, [identity, clear]);

  const validateSession = useMemo(
    () =>
      createSessionRevalidator<Session>({
        close: () => setChanging(true),
        clear,
        read: () => readUncachedSession<Session>((options) => authClient.getSession(options)),
        publish: (freshSession) => authClient.hydrateSession(freshSession),
        open: () => setChanging(false),
      }),
    [clear],
  );
  const refresh = useCallback(async () => {
    await validateSession();
    setBlockedRealtimeIdentity(null);
  }, [validateSession]);
  const revalidate = useCallback(async () => {
    // A forbidden socket must not remount itself into an automatic retry loop.
    setBlockedRealtimeIdentity(identity);
    await validateSession();
  }, [identity, validateSession]);

  const privateReady = !changing && clearedIdentity === identity;
  const value: AuthContextValue = {
    session,
    isPending: isPending || !privateReady,
    refresh,
    async signOut() {
      setChanging(true);
      clear();
      try {
        const response = await authClient.signOut();
        if (response.error) throw new Error(response.error.message ?? "Could not sign out.");
        await refresh();
      } finally {
        setChanging(false);
      }
    },
    async setActiveOrganization(organizationId) {
      setChanging(true);
      clear();
      try {
        const response = await authClient.organization.setActive({ organizationId });
        if (response.error)
          throw new Error(response.error.message ?? "Could not switch workspace.");
        await refresh();
      } finally {
        setChanging(false);
      }
    },
  };
  return (
    <AuthContext.Provider value={value}>
      {session?.user.emailVerified && !changing && blockedRealtimeIdentity !== identity ? (
        <MobileLifecycle
          userId={session.user.id}
          organizationId={session.session.activeOrganizationId ?? null}
          revalidate={revalidate}
        />
      ) : null}
      <View className="flex-1">
        <View
          className="flex-1"
          style={{ opacity: privateReady ? 1 : 0 }}
          pointerEvents={privateReady ? "auto" : "none"}
          importantForAccessibility={privateReady ? "auto" : "no-hide-descendants"}
          accessibilityElementsHidden={!privateReady}
        >
          {children}
          <LayoutAnimationConfig skipExiting>
            {privateReady ? (
              <>
                <PortalHost />
                <Toaster />
              </>
            ) : null}
          </LayoutAnimationConfig>
        </View>
        {!privateReady ? (
          <View className="absolute inset-0 items-center justify-center bg-background">
            <ActivityIndicator accessibilityLabel="Checking your session" />
          </View>
        ) : null}
      </View>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requires AuthProvider.");
  return context;
}
