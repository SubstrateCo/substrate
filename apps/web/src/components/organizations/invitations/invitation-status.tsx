import { invitationState } from "./invitation-state";
import { cn } from "cn";

export function InvitationStatus({ status, expired }: { status: string; expired: boolean }) {
  const { label, icon: Icon, className } = invitationState(status, expired);
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", className)} />
      {label}
    </span>
  );
}
