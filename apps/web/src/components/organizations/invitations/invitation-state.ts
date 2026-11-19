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
