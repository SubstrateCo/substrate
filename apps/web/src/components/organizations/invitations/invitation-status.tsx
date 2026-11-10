import { cn } from "cn";
import { CircleCheck, CircleX, Clock, TimerOff, type LucideIcon } from "lucide-react";

const statuses = {
  pending: { label: "Pending", icon: Clock },
  expired: { label: "Expired", icon: TimerOff, className: "text-warning" },
  accepted: { label: "Accepted", icon: CircleCheck, className: "text-success" },
  rejected: { label: "Declined", icon: CircleX },
  canceled: { label: "Canceled", icon: CircleX },
} satisfies Record<string, { label: string; icon: LucideIcon; className?: string }>;

/** One state per invitation. A pending invitation past its expiry is "Expired". */
export function invitationState(status: string, expired: boolean) {
  const key = status === "pending" && expired ? "expired" : status;
  const match = Object.entries(statuses).find(([name]) => name === key)?.[1];
  const state: { label: string; icon: LucideIcon; className?: string } = match ?? {
    label: "Unknown",
    icon: Clock,
  };
  return state;
}

export function InvitationStatus({ status, expired }: { status: string; expired: boolean }) {
  const { label, icon: Icon, className } = invitationState(status, expired);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", className)} />
      {label}
    </span>
  );
}
