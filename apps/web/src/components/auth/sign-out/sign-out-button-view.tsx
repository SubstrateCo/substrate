import { PendingButton } from "../../feedback/pending-button";
import { LogOut } from "lucide-react";

export function SignOutButton({
  pending = false,
  onSignOut,
}: {
  pending?: boolean;
  onSignOut: () => void;
}) {
  return (
    <PendingButton variant="ghost" pending={pending} onClick={onSignOut}>
      <LogOut aria-hidden="true" />
      Sign out
    </PendingButton>
  );
}
