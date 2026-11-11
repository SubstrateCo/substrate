import { useEffect, useState } from "react";

import { DesktopSignIn as DesktopSignInView } from "@/components/auth/desktop/desktop-sign-in-view";
import { safeRedirect } from "@/lib/auth/navigation";
import "@/lib/desktop/auth";
import { useDesktopSignIn } from "@/queries/auth/desktop-mutations";

export function DesktopSignIn({ redirect }: { redirect: string }) {
  const [waiting, setWaiting] = useState(false);
  const [authError, setAuthError] = useState<Error | null>(null);
  const request = useDesktopSignIn();
  useEffect(() => {
    const authenticated = window.onAuthenticated!(() => {
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
  }, [redirect]);
  return (
    <DesktopSignInView
      pending={request.isPending}
      waiting={waiting}
      error={authError ?? request.error}
      failed={!!authError}
      onSignIn={() => {
        setAuthError(null);
        request.mutate(undefined, { onSuccess: () => setWaiting(true) });
      }}
    />
  );
}
