import { Timestamp } from "@/components/time/timestamp";
import { Bot, CircleDot, Plus, Hash, Link2, MessageSquare, Unlink } from "lucide-react";

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string | null;
  actorType?: "human" | "agent";
  createdAt: string;
  source: { href: string; conversationName: string | null } | null;
};

// Known server actions read as a verb phrase after the actor's name.
const phrasing = new Map([
  ["Task created", { icon: Plus, verb: "created the task" }],
  ["Created from a discussion", { icon: MessageSquare, verb: "created this from" }],
  ["Discussion linked", { icon: Link2, verb: "linked" }],
  ["Discussion unlinked", { icon: Unlink, verb: "unlinked" }],
]);

export function ActivityRow({ event }: { event: ActivityEvent }) {
  const known = phrasing.get(event.action);
  const Icon = known?.icon ?? CircleDot;
  const SourceIcon = event.source?.conversationName ? Hash : MessageSquare;
  return (
    <li className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-row-hover">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate font-medium">{event.actorName ?? "Unknown"}</span>
        {event.actorType === "agent" && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 text-xs font-medium text-muted-foreground">
            <Bot aria-hidden="true" className="size-3" />
            Agent
          </span>
        )}
        <span className="shrink-0 text-muted-foreground">{known?.verb ?? event.action}</span>
        {event.source && (
          <a
            href={event.source.href}
            className="inline-flex min-w-0 items-center gap-0.5 rounded-sm bg-muted px-1 font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SourceIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{event.source.conversationName ?? "Direct message"}</span>
          </a>
        )}
      </span>
      <Timestamp value={event.createdAt} className="shrink-0 text-xs text-muted-foreground" />
    </li>
  );
}
