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
        className={compact ? "text-white/60 hover:bg-white/10 hover:text-white" : undefined}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? (pending ? "Signing out…" : "Sign out") : undefined}
        disabled={pending}
        onClick={onSignOut}
      >
        {compact ? <LogOut className="size-5" /> : pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <div
          className={
            compact ? "absolute bottom-0 left-full z-50 ml-2 w-56 text-foreground" : undefined
          }
        >
          <FormMessage error={error} />
        </div>
      )}
    </div>
  );
}
