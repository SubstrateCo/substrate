import { PendingButton } from "../../feedback/pending-button";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "@/components/feedback/form-message";

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
      description="Sign in securely in your browser, then return to Substrate."
    >
      {waiting && (
        <p role="status" className="text-sm text-muted-foreground">
          Finish signing in in your browser. You can open it again if you closed it.
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
      <PendingButton className="w-full" size="lg" pending={pending} onClick={onSignIn}>
        {waiting ? "Open browser again" : "Sign in with browser"}
      </PendingButton>
    </AuthFrame>
  );
}
