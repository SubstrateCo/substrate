import type { ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "@/components/feedback/form-message";

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
      title="Return to Substrate"
      description="You’re signed in. Continue in the desktop app."
      actions={signOut}
    >
      {email && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm wrap-anywhere text-muted-foreground">
          Signed in as {email}
        </p>
      )}
      <FormMessage
        error={error}
        errorDescription="Could not return to Substrate. Please try again."
      />
      <PendingButton className="w-full" size="lg" pending={pending} onClick={onContinue}>
        Continue to Substrate
      </PendingButton>
    </AuthFrame>
  );
}
