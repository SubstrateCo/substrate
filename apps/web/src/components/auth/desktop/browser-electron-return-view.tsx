import type { ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function BrowserElectronReturn({
  pending,
  error,
  onContinue,
  email,
  signOut,
}: {
  pending: boolean;
  error?: Error | null;
  onContinue: () => void;
  email?: string;
  signOut: ReactNode;
}) {
  return (
    <AuthFrame
      title="Return to Startup OS"
      description="You are signed in. Continue in the desktop app."
    >
      {email && <p className="text-sm wrap-anywhere">Signed in as {email}</p>}
      <PendingButton
        className="w-full"
        pending={pending}
        pendingLabel="Returning…"
        onClick={onContinue}
      >
        Continue to Startup OS
      </PendingButton>
      <FormMessage
        error={error}
        errorDescription="Could not return to Startup OS. Please try again."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Need a different account?</p>
        {signOut}
      </div>
    </AuthFrame>
  );
}
