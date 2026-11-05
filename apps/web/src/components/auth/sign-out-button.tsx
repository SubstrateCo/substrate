import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "./form-message";

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
    <div className={compact ? "relative" : "space-y-2"}>
      <Button
        variant="ghost"
        size={compact ? "icon-lg" : "default"}
        className={compact ? "text-white/60 hover:bg-white/10 hover:text-white" : undefined}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? (signOut.isPending ? "Signing out…" : "Sign out") : undefined}
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {compact ? <LogOut className="size-5" /> : signOut.isPending ? "Signing out…" : "Sign out"}
      </Button>
      {signOut.error && (
        <div
          className={
            compact ? "absolute bottom-0 left-full z-50 ml-2 w-56 text-foreground" : undefined
          }
        >
          <FormMessage error={signOut.error} />
        </div>
      )}
    </div>
  );
}
