import { useMutation, useQueryClient } from "@tanstack/react-query";

import { SignOutButton as SignOutButtonView } from "@/components/auth/sign-out/sign-out-button-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { authHref } from "@/lib/auth/browser-links";
import { authClient } from "@/lib/auth/client";
import { isDesktop } from "@/lib/desktop/auth";
import { confirmDiscardDrafts } from "@/lib/navigation/unsaved-drafts";
import { toast } from "sonner";

export function SignOutButton({ destination }: { destination?: string }) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => {
      if (!(await confirmDiscardDrafts())) return;
      if (isDesktop()) await window.signOut!();
      else {
        const result = await authClient.signOut();
        if (result.error) throw new Error(result.error.message || "Could not sign out.");
      }
      // Clear private state before the next document replaces this one.
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign(authHref("/login", destination ?? "/dashboard"));
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error, "We couldn’t sign you out. Please try again.")),
  });
  return <SignOutButtonView pending={signOut.isPending} onSignOut={() => signOut.mutate()} />;
}
