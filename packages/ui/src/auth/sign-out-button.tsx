import { LogOut } from "lucide-react";
import { Button } from "../primitives/button";
import { FormMessage } from "./form-message";
import { Spinner } from "../primitives/spinner";

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
  const label = pending ? "Signing out…" : "Sign out";
  return (
    <div className={compact ? "relative" : "space-y-2"}>
      <Button
        variant={compact ? "rail" : "ghost"}
        size={compact ? "icon-lg" : "default"}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? label : undefined}
        disabled={pending}
        aria-busy={pending}
        onClick={onSignOut}
      >
        {pending ? (
          <Spinner aria-hidden="true" role="presentation" />
        ) : (
          <LogOut aria-hidden="true" className={compact ? "size-5" : "size-4"} />
        )}
        {!compact && label}
      </Button>
      <FormMessage
        floating={compact}
        error={error}
        errorDescription="We couldn’t sign you out. Please try again."
      />
    </div>
  );
}
