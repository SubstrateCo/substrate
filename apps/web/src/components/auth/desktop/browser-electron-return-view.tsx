import { PendingButton } from "../../feedback/pending-button";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function BrowserElectronReturn({
  pending,
  error,
  onContinue,
}: {
  pending: boolean;
  error?: Error | null;
  onContinue: () => void;
}) {
  return (
    <AuthFrame
      title="Return to Startup OS"
      description="You are signed in. Continue in the desktop app."
    >
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
    </AuthFrame>
  );
}
