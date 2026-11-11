import { SignOutButton as SignOutButtonView } from "@/components/auth/sign-out/sign-out-button-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useAuthHref } from "@/hooks/use-auth-href";
import { leaveDocument } from "@/lib/navigation/unsaved-drafts";
import { useSignOut } from "@/queries/auth/mutations";
import { toast } from "sonner";

export function SignOutButton({ destination }: { destination?: string }) {
  const signOut = useSignOut();
  const authHref = useAuthHref();
  return (
    <SignOutButtonView
      pending={signOut.isPending}
      onSignOut={() =>
        void leaveDocument(authHref("/login", destination ?? "/dashboard"), async () => {
          await signOut.mutateAsync();
        }).catch((error: Error) =>
          toast.error(actionErrorMessage(error, "We couldn't sign you out. Please try again.")),
        )
      }
    />
  );
}
