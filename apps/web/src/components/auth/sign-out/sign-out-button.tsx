import { SignOutButton as SignOutButtonView } from "@/components/auth/sign-out/sign-out-button-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { authHref } from "@/lib/auth/browser-links";
import { confirmDiscardDrafts } from "@/lib/navigation/unsaved-drafts";
import { useSignOut } from "@/queries/auth/mutations";
import { toast } from "sonner";

export function SignOutButton({ destination }: { destination?: string }) {
  const signOut = useSignOut();
  return (
    <SignOutButtonView
      pending={signOut.isPending}
      onSignOut={async () => {
        if (!(await confirmDiscardDrafts())) return;
        signOut.mutate(undefined, {
          onSuccess: () => window.location.assign(authHref("/login", destination ?? "/dashboard")),
          onError: (error) =>
            toast.error(actionErrorMessage(error, "We couldn’t sign you out. Please try again.")),
        });
      }}
    />
  );
}
