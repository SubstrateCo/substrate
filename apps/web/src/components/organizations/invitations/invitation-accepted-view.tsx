import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthNavLink } from "@/components/auth/auth-link";
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
      description="You're a member now. Continue to open the workspace."
      actions={<AuthNavLink href="/organizations">Your workspaces</AuthNavLink>}
    >
      <FormMessage
        error={error}
        errorDescription="You joined the workspace, but we couldn't open it. Try again without accepting the invitation again."
      />
      <PendingButton
        className="w-full"
        size="lg"
        pending={pending}
        pendingLabel="Opening."
        onClick={onContinue}
      >
        Continue setup
      </PendingButton>
    </AuthFrame>
  );
}
