import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Bot, CircleDot, Link2, MessageCircle, MessageSquare, Unlink } from "lucide-react";

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string | null;
  actorImage?: string | null;
  actorType?: "human" | "agent";
  createdAt: string;
  source: {
    href: string;
    conversationName: string | null;
    conversationKind?: "channel" | "dm" | "group";
    private?: boolean;
  } | null;
};

// Known server actions read as a verb phrase after the actor's name.
const phrasing = new Map([
  ["Task created", { icon: CircleDot, verb: "created the task" }],
  ["Created from a discussion", { icon: MessageSquare, verb: "created this from" }],
  ["Discussion linked", { icon: Link2, verb: "linked" }],
  ["Discussion unlinked", { icon: Unlink, verb: "unlinked" }],
]);

export function ActivityRow({ event }: { event: ActivityEvent }) {
  const known = phrasing.get(event.action);
  const Icon = known?.icon ?? CircleDot;
  return (
    <li className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-row-hover">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <PersonAvatar
          name={event.actorName ?? "Unknown"}
          image={event.actorImage}
          agent={event.actorType === "agent"}
          size="xs"
        />
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
            {event.source.conversationKind ? (
              <ConversationKindIcon
                kind={event.source.conversationKind}
                private={event.source.private}
                className="size-3 shrink-0 text-muted-foreground"
              />
            ) : (
              <MessageCircle aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">
              {event.source.conversationName ??
                (event.source.conversationKind === "group" ? "Group message" : "Direct message")}
            </span>
          </a>
        )}
      </span>
      <Timestamp value={event.createdAt} className="shrink-0 text-xs text-muted-foreground" />
    </li>
  );
}
