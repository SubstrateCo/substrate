import type { ConversationKind } from "@substrate/contracts/messaging/input";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import { useRef, type ReactNode } from "react";

import { CommandItem } from "../../ui/command";
import { ChannelSearchResultContent } from "./channel-search-result";
import { searchRowClass, SearchRowFrame } from "./search-row";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format/date";
import { conversationLabel } from "@/lib/messaging/conversations";
import type { RecordLink } from "@/lib/navigation/record-links";
import {
  FolderKanban,
  Building2,
  Contact,
  Handshake,
  MessageSquare,
  ListTodo,
  LockKeyhole,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";

export type SearchResultItem = {
  id: string;
  kind: string;
  title: string;
  link: RecordLink;
  // Task results only.
  projectName?: string;
  status?: TaskStatus;
  // Conversation, channel, and message results.
  conversationKind?: ConversationKind;
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

function conversationNoun(item: SearchResultItem) {
  if (item.conversationKind === "dm") return "Direct message";
  if (item.conversationKind === "group") return "Group";
  return item.private ? "Private channel" : "Channel";
}

/** Where a message was sent: "#launch", a lock and the private channel's name, or the DM or group name. */
function Place({ item }: { item: SearchResultItem }) {
  const name = item.conversationName ?? "a conversation";
  if (!item.conversationKind) return name;
  const locked = item.conversationKind === "channel" && item.private;
  return (
    <>
      {locked && <LockKeyhole aria-hidden="true" className="mr-1 inline size-3 -translate-y-px" />}
      {conversationLabel({ kind: item.conversationKind, private: item.private, name })}
    </>
  );
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
  const crmKinds = {
    contact: { Icon: Contact, label: "Contact" },
    account: { Icon: Building2, label: "Account" },
    deal: { Icon: Handshake, label: "Deal" },
    contact_interaction: { Icon: MessageSquare, label: "Interaction" },
  };
  const crmKind = Object.entries(crmKinds).find(([kind]) => kind === item.kind)?.[1];
  if (crmKind) {
    const { Icon, label } = crmKind;
    return { icon: icon(Icon), title: item.title, kind: label, detail: label };
  }
  if (item.kind === "message")
    return {
      icon: icon(MessageSquareText),
      title: item.excerpt ?? item.title,
      kind: "Message",
      detail: (
        <>
          <Place item={item} />
          {item.authorName && ` · ${item.authorName}`}
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
    icon: (
      <ConversationKindIcon
        kind={item.conversationKind ?? "channel"}
        private={item.private}
        className="size-4 text-muted-foreground"
      />
    ),
    title: item.title,
    kind: noun,
    detail: noun,
  };
}

export function SearchResult({ item, query }: { item: SearchResultItem; query: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  const { icon, title, kind, detail } = describe(item);
  return (
    <SearchRowFrame>
      {/* Enter follows the row's router link, so unsaved-draft guards see the navigation. */}
      <CommandItem
        value={item.id}
        onSelect={() => link.current?.click()}
        // oxlint-disable-next-line shadcn/require-static-classes -- The shared classes match the command item's default geometry for inert rows.
        className={`${searchRowClass} items-start`}
      >
        <SearchResultContent icon={icon}>
          <Link
            ref={link}
            // Two lines at rest. The selected row shows the whole title and context, so a
            // keyboard user can tell long results with the same start apart before opening one.
            className="line-clamp-2 block wrap-anywhere outline-none group-data-[selected=true]/command-item:line-clamp-none focus-visible:underline"
            {...item.link}
            aria-label={`${kind}: ${title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Highlight text={title} query={query} />
          </Link>
          {detail && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground group-data-[selected=true]/command-item:wrap-anywhere group-data-[selected=true]/command-item:whitespace-normal">
              {detail}
            </span>
          )}
        </SearchResultContent>
      </CommandItem>
    </SearchRowFrame>
  );
}

function SearchResultContent({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </>
  );
}

export function SearchResultLoading({ browsing }: { browsing: boolean }) {
  return (
    <div role="status">
      <span className="sr-only">Searching workspace</span>
      <div aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <SearchRowFrame key={i}>
            <div className={`${searchRowClass} ${browsing ? "" : "items-start"}`}>
              {browsing ? (
                <ChannelSearchResultContent
                  icon={<SkeletonText width="1rem" className="h-4" />}
                  title={<SkeletonText width="9rem" />}
                  members={<SkeletonText width="4rem" />}
                  action={<SkeletonText width="3.5rem" />}
                />
              ) : (
                <SearchResultContent icon={<SkeletonText width="1rem" className="h-4" />}>
                  <span className="block">
                    <SkeletonText width="12rem" />
                  </span>
                  <span className="mt-0.5 block text-xs">
                    <SkeletonText width="7rem" />
                  </span>
                </SearchResultContent>
              )}
            </div>
          </SearchRowFrame>
        ))}
      </div>
    </div>
  );
}
