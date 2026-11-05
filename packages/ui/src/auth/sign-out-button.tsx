import { LogOut } from "lucide-react";
import { Button } from "../primitives/button";
import { FormMessage } from "./form-message";

export function SignOutButton({
  compact = false,
  pending = false,
  error,
  onSignOut,
}: {
  compact?: boolean;
  pending?: boolean;
  error?: Error | null;
  onSignOut: () => void;
}) {
  return (
    <div className={compact ? "relative" : "space-y-2"}>
      <Button
        variant={compact ? "rail" : "ghost"}
        size={compact ? "icon-lg" : "default"}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? (pending ? "Signing out…" : "Sign out") : undefined}
        disabled={pending}
        onClick={onSignOut}
      >
        <LogOut className={compact ? "size-5" : "size-4"} />
        {!compact && (pending ? "Signing out…" : "Sign out")}
      </Button>
      <FormMessage error={error} floating />
    </div>
  );
}
