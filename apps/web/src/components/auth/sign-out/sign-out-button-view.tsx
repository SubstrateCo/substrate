import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { LogOut } from "lucide-react";

export function SignOutButton({
  pending = false,
  onSignOut,
}: {
  pending?: boolean;
  onSignOut: () => void;
}) {
  const label = pending ? "Signing out…" : "Sign out";
  return (
    <Button variant="ghost" disabled={pending} aria-busy={pending} onClick={onSignOut}>
      {pending ? (
        <Spinner aria-hidden="true" role="presentation" />
      ) : (
        <LogOut aria-hidden="true" className="size-4" />
      )}
      {label}
    </Button>
  );
}
