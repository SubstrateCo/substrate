import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { ErrorState } from "@/components/feedback/error-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Tag } from "@/components/feedback/tag";
import { RowAction } from "@/components/layout/row-actions";
import { ConversationActionsMenu } from "@/components/messaging/conversations/actions/conversation-actions-menu";
import { ActorAvatar, ActorKindTag } from "@/components/people/actor-avatar";
import { AppTable, createAppColumnHelper } from "@/components/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { actorIdentity } from "@/lib/actors/identity";
import type { ConversationMember } from "@/lib/messaging/conversations";
import type { ResourceState } from "@/lib/resource-state";
import { Hash, LockKeyhole, UserPlus, Users } from "lucide-react";

export interface ManagedConversationRow {
  id: string;
  kind: ConversationKind;
  name: string | null;
  private: boolean;
  ownerName: string;
  members: ConversationMember[];
}

const shownAvatars = 3;

function KindIcon({ row }: { row: ManagedConversationRow }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (row.kind === "group") return <Users className={className} aria-label="Group message" />;
  if (row.private) return <LockKeyhole className={className} aria-label="Private channel" />;
  return <Hash className={className} aria-label="Public channel" />;
}

function MemberSummary({ members }: { members: ConversationMember[] }) {
  const label = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Pressable
          className="flex items-center gap-2 rounded-md text-sm text-muted-foreground"
          aria-label={`View ${label}`}
        >
          <span className="flex gap-0.5">
            {members.slice(0, shownAvatars).map((person) => (
              <ActorAvatar key={person.actorId} actor={actorIdentity(person)} />
            ))}
          </span>
          <span className="whitespace-nowrap tabular-nums">{label}</span>
        </Pressable>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8}>
        <p className="px-2 text-sm font-medium">Members</p>
        <ul aria-label="Conversation members" className="max-h-64 space-y-1 overflow-y-auto">
          {members.map((person) => {
            const actor = actorIdentity(person);
            return (
              <li key={person.actorId} className="flex items-center gap-2 rounded-md px-2 py-1">
                <ActorAvatar actor={actor} />
                <span className="min-w-0 flex-1 text-sm wrap-anywhere">{person.name}</span>
                <ActorKindTag actor={actor} />
                {person.external && <Tag>External</Tag>}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// Admins see names and members only. Nothing here opens the messages.
export function ManagedConversations({
  resource,
  onRetry,
  onAddMembers,
  onTransfer,
  onDelete,
}: {
  resource: ResourceState<ManagedConversationRow[]>;
  onRetry: () => void;
  onAddMembers: (id: string) => void;
  onTransfer: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (resource.status === "unavailable")
    return (
      <ErrorState
        title="Conversations unavailable"
        description="Check that you still have access to this workspace."
      />
    );
  if (resource.status === "error")
    return <ErrorState title="Couldn’t load conversations" onRetry={onRetry} />;
  return (
    <div className="space-y-3">
      {resource.status === "stale" && (
        <StaleNotice title="This list may be out of date." onRetry={onRetry} />
      )}
      <AppTable
        name="Channels and group messages"
        columns={columns}
        data={resource.data ?? []}
        getRowId={(row) => row.id}
        loading={resource.status === "loading"}
        loadingMessage="Loading conversations"
        empty={{
          icon: Hash,
          title: "No channels or group messages",
          description:
            "Channels and group messages people create in this organization appear here.",
        }}
        rowActions={{
          label: (row) => `${conversationName(row)} actions`,
          width: "w-24",
          render: (row) => (
            <>
              <RowAction
                label={`Add people to ${conversationName(row)}`}
                onClick={() => onAddMembers(row.id)}
              >
                <UserPlus aria-hidden="true" />
              </RowAction>
              <ConversationActionsMenu
                deleteLabel={row.kind === "channel" ? "Delete channel" : "Delete group"}
                onTransfer={() => onTransfer(row.id)}
                onDelete={() => onDelete(row.id)}
              />
            </>
          ),
        }}
      />
    </div>
  );
}

function conversationName(row: ManagedConversationRow) {
  return row.name ?? "Group message";
}

const column = createAppColumnHelper<ManagedConversationRow>();

const columns = column.columns([
  column.accessor(conversationName, {
    id: "conversation",
    header: "Conversation",
    cell: ({ row }) => (
      <span className="flex max-w-64 min-w-0 items-center gap-2">
        <KindIcon row={row.original} />
        <span className="truncate font-medium">{conversationName(row.original)}</span>
      </span>
    ),
  }),
  column.accessor("ownerName", {
    header: "Owner",
    cell: ({ getValue }) => (
      <span className="block truncate text-muted-foreground">{getValue()}</span>
    ),
  }),
  column.accessor((row) => row.members.length, {
    id: "members",
    header: "Members",
    meta: { width: "w-44", controls: true },
    cell: ({ row }) => <MemberSummary members={row.original.members} />,
  }),
]);
