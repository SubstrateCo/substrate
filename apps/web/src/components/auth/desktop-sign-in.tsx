import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { DesktopSignIn as DesktopSignInView } from "@/components/auth/desktop-sign-in-view";
import { safeRedirect } from "@/lib/auth-navigation";
import "@/lib/desktop-auth";

export function DesktopSignIn({ redirect }: { redirect: string }) {
  const queryClient = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [authError, setAuthError] = useState<Error | null>(null);
  const request = useMutation({
    mutationFn: async () => {
      setAuthError(null);
      await window.requestAuth!();
      setWaiting(true);
    },
  });
  useEffect(() => {
    const authenticated = window.onAuthenticated!(() => {
      queryClient.clear();
      window.location.assign(safeRedirect(redirect));
    });
    const failed = window.onAuthError!(() => {
      setWaiting(false);
      setAuthError(new Error("Could not complete sign-in. Please try again."));
    });
    return () => {
      authenticated();
      failed();
    };
  }, [queryClient, redirect]);
  return (
    <DesktopSignInView
      pending={request.isPending}
      waiting={waiting}
      error={authError ?? request.error}
      failed={!!authError}
      onSignIn={() => request.mutate()}
    />
  );
}
