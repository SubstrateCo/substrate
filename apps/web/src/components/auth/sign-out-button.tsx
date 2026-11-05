import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "./form-message";

export function SignOutButton() {
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
    <div className="space-y-2">
      <Button variant="ghost" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        {signOut.isPending ? "Signing out…" : "Sign out"}
      </Button>
      <FormMessage error={signOut.error} />
    </div>
  );
}
