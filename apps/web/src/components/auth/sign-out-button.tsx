import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SignOutButton as SignOutButtonView } from "@startup-os/ui/auth/sign-out-button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean } = {}) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
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
