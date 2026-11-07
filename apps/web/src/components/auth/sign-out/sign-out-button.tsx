import { useMutation, useQueryClient } from "@tanstack/react-query";

import { SignOutButton as SignOutButtonView } from "@/components/auth/sign-out/sign-out-button-view";
import { authClient } from "@/lib/auth/client";
import { isDesktop } from "@/lib/desktop/auth";

export function SignOutButton({ compact = false }: { compact?: boolean } = {}) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => {
      if (isDesktop()) await window.signOut!();
      else {
        const result = await authClient.signOut();
        if (result.error) throw new Error(result.error.message || "Could not sign out.");
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/login");
    },
  });
  return (
    <SignOutButtonView
      compact={compact}
      pending={signOut.isPending}
      error={signOut.error}
      onSignOut={() => signOut.mutate()}
    />
  );
}
