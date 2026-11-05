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
        variant="ghost"
        size={compact ? "icon-lg" : "default"}
        className={
          compact
            ? "text-rail-foreground/60 hover:bg-rail-foreground/10 hover:text-rail-foreground"
            : undefined
        }
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? (pending ? "Signing out…" : "Sign out") : undefined}
        disabled={pending}
        onClick={onSignOut}
      >
        {compact ? <LogOut className="size-5" /> : pending ? "Signing out…" : "Sign out"}
      </Button>
      <FormMessage error={error} floating />
    </div>
  );
}
