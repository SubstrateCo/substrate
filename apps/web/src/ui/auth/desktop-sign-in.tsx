import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { PendingButton } from "../feedback/pending-button";

export function DesktopSignIn({
  pending,
  waiting,
  error,
  failed,
  onSignIn,
}: {
  pending: boolean;
  waiting: boolean;
  error?: Error | null;
  failed: boolean;
  onSignIn: () => void;
}) {
  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in securely in your browser, then return to Startup OS."
    >
      <PendingButton
        className="w-full"
        pending={pending}
        pendingLabel="Opening browser…"
        onClick={onSignIn}
      >
        Sign in with browser
      </PendingButton>
      {waiting && (
        <p role="status" className="text-sm text-muted-foreground">
          Complete sign-in in your browser. You can open it again if needed.
        </p>
      )}
      <FormMessage
        error={error}
        errorDescription={
          failed
            ? "Could not complete sign-in. Please try again."
            : "Could not open sign-in. Please try again."
        }
      />
    </AuthFrame>
  );
}
