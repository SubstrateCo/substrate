import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthFrame } from "@startup-os/ui/auth/auth-frame";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { PendingButton } from "@startup-os/ui/feedback/pending-button";
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
    <AuthFrame
      title="Welcome back"
      description="Sign in securely in your browser, then return to Startup OS."
    >
      <PendingButton
        className="w-full"
        pending={request.isPending}
        pendingLabel="Opening browser…"
        onClick={() => request.mutate()}
      >
        Sign in with browser
      </PendingButton>
      {waiting && (
        <p role="status" className="text-sm text-muted-foreground">
          Complete sign-in in your browser. You can open it again if needed.
        </p>
      )}
      <FormMessage
        error={authError ?? request.error}
        errorDescription={
          authError
            ? "Could not complete sign-in. Please try again."
            : "Could not open sign-in. Please try again."
        }
      />
    </AuthFrame>
  );
}
