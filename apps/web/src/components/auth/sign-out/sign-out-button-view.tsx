import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { LogOut } from "lucide-react";

export function SignOutButton({
  compact = false,
  pending = false,
  onSignOut,
}: {
  compact?: boolean;
  pending?: boolean;
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
    </div>
  );
}
