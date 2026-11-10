import { taskStatusLabels, type TaskStatus } from "@startup-os/contracts/tasks";

import { useRef, type ReactNode } from "react";

import { CommandItem } from "../../ui/command";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format/date";
import {
  FolderKanban,
  Hash,
  ListTodo,
  LockKeyhole,
  MessageCircle,
  MessageSquareText,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SearchResultItem = {
  id: string;
  kind: string;
  title: string;
  href: string;
  // Task results only.
  projectName?: string;
  status?: TaskStatus;
  // Conversation, channel, and message results.
  conversationKind?: "dm" | "group" | "channel";
  conversationName?: string;
  private?: boolean;
  // Message results only: one line with references resolved for the viewer.
  excerpt?: string;
  authorName?: string;
  createdAt?: string;
  // Channel results only.
  membership?: "joined" | "left" | "none";
  memberCount?: number;
};

function conversationIcon(kind?: SearchResultItem["conversationKind"], locked?: boolean) {
  if (kind === "dm") return MessageCircle;
  if (kind === "group") return Users;
  return locked ? LockKeyhole : Hash;
}

function conversationNoun(item: SearchResultItem) {
  if (item.conversationKind === "dm") return "Direct message";
  if (item.conversationKind === "group") return "Group";
  return item.private ? "Private channel" : "Channel";
}

/** Where a message was sent: "#launch", or the DM or group name. */
function place(item: SearchResultItem) {
  const name = item.conversationName ?? "a conversation";
  return item.conversationKind === "channel" ? `#${name}` : name;
}

/** The query's matches in bold, case-insensitively. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let start = 0;
  for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, start)) {
    if (index > start) parts.push(text.slice(start, index));
    parts.push(
      <mark key={index} className="bg-transparent font-semibold text-foreground">
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    start = index + needle.length;
  }
  parts.push(text.slice(start));
  return parts;
}

function describe(item: SearchResultItem) {
  const icon = (Icon: LucideIcon) => (
    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
  );
  if (item.kind === "task")
    return {
      icon: item.status ? <TaskStatusIcon status={item.status} /> : icon(ListTodo),
      title: item.title,
      kind: "Task",
      detail: [item.projectName, item.status && taskStatusLabels[item.status]]
        .filter(Boolean)
        .join(" · "),
    };
  if (item.kind === "project")
    return { icon: icon(FolderKanban), title: item.title, kind: "Project", detail: "Project" };
  if (item.kind === "message")
    return {
      icon: icon(MessageSquareText),
      title: item.excerpt ?? item.title,
      kind: "Message",
      detail: (
        <>
          {[place(item), item.authorName].filter(Boolean).join(" · ")}
          {item.createdAt && (
            <>
              {" · "}
              <time dateTime={item.createdAt} title={formatFullTimestamp(item.createdAt)}>
                {formatRelativeTime(item.createdAt)}
              </time>
            </>
          )}
        </>
      ),
    };
  const noun = conversationNoun(item);
  return {
    icon: icon(conversationIcon(item.conversationKind, item.private)),
    title: item.title,
    kind: noun,
    detail: noun,
  };
}

export function SearchResult({ item, query }: { item: SearchResultItem; query: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  const { icon, title, kind, detail } = describe(item);
  return (
    <div className="px-1">
      <CommandItem value={item.id} onSelect={() => link.current?.click()} className="items-start">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <a
            ref={link}
            className="block truncate outline-none focus-visible:underline"
            href={item.href}
            aria-label={`${kind}: ${title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Highlight text={title} query={query} />
          </a>
          {detail && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
          )}
        </span>
      </CommandItem>
    </div>
  );
}
