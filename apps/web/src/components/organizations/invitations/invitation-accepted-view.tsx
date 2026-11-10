import { AuthFrame } from "@/components/auth/auth-frame";
import { FormMessage } from "@/components/auth/form-message";
import { PendingButton } from "@/components/feedback/pending-button";

export function InvitationAcceptedView({
  pending,
  error,
  onContinue,
}: {
  pending: boolean;
  error: Error | null;
  onContinue: () => void;
}) {
  return (
    <AuthFrame
      title="Invitation accepted"
      description="Your membership was saved. Continue to open the workspace."
    >
      <FormMessage
        error={error}
        errorDescription="You joined the workspace, but we couldn’t open it. Try again without accepting the invitation again."
      />
      <PendingButton
        className="w-full"
        pending={pending}
        pendingLabel="Opening…"
        onClick={onContinue}
      >
        Continue setup
      </PendingButton>
      <a className="text-sm underline" href="/organizations">
        Your workspaces
      </a>
    </AuthFrame>
  );
}
