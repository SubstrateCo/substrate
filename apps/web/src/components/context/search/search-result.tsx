import type { ConversationKind } from "@substrate/contracts/messaging/input";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import { useRef, type ReactNode } from "react";

import { entityKinds } from "../entity-kinds";
import { ChannelSearchResultContent } from "./channel-search-result";
import { searchRowClass, SearchRowFrame } from "./search-row";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { CommandItem } from "@/components/ui/command";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format/date";
import { conversationLabel } from "@/lib/messaging/conversations";
import type { RecordLink } from "@/lib/navigation/record-links";
import { LockKeyhole, type LucideIcon } from "lucide-react";

export type SearchResultItem = {
  id: string;
  kind: string;
  title: string;
  link: RecordLink;
  projectName?: string;
  status?: TaskStatus;
  conversationKind?: ConversationKind;
  conversationName?: string;
  private?: boolean;
  excerpt?: string;
  authorName?: string;
  createdAt?: string;
  membership?: "joined" | "left" | "none";
  memberCount?: number;
};

function conversationNoun(item: SearchResultItem) {
  if (item.conversationKind === "dm") return "Direct message";
  if (item.conversationKind === "agent_dm") return "Agent DM";
  if (item.conversationKind === "group") return "Group";
  return item.private ? "Private channel" : "Channel";
}

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

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let start = 0;
  for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, start)) {
    if (index > start) parts.push(text.slice(start, index));
    parts.push(
      <mark key={index} className="bg-transparent font-medium text-foreground">
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    start = index + needle.length;
  }
  parts.push(text.slice(start));
  return parts;
}

const recordKinds = ["project", "contact", "account", "deal", "contact_interaction"] as const;

function describe(item: SearchResultItem) {
  const icon = (Icon: LucideIcon) => (
    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
  );
  if (item.kind === "task")
    return {
      icon: item.status ? <TaskStatusIcon status={item.status} /> : icon(entityKinds.task.icon),
      title: item.title,
      kind: entityKinds.task.label,
      detail: [item.projectName, item.status && taskStatusLabels[item.status]]
        .filter(Boolean)
        .join(" · "),
    };
  const recordKind = recordKinds.find((kind) => kind === item.kind);
  if (recordKind) {
    const { icon: Icon, label } = entityKinds[recordKind];
    return { icon: icon(Icon), title: item.title, kind: label, detail: label };
  }
  if (item.kind === "message")
    return {
      icon: icon(entityKinds.message.icon),
      title: item.excerpt ?? item.title,
      kind: entityKinds.message.label,
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
      <CommandItem
        value={item.id}
        onSelect={() => link.current?.click()}
        // oxlint-disable-next-line shadcn/require-static-classes -- The shared classes match the command item's default geometry for inert rows.
        className={`${searchRowClass} items-start`}
      >
        <SearchResultContent icon={icon}>
          <Link
            ref={link}
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
