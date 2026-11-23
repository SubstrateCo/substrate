import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Tag } from "@/components/feedback/tag";
import { RowActions } from "@/components/layout/row-actions";
import { ConversationActionsMenu } from "@/components/messaging/conversations/actions/conversation-actions-menu";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConversationMember } from "@/lib/messaging/conversations";
import type { ResourceStatus } from "@/lib/resource-state";
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
        <button
          type="button"
          className="flex items-center gap-2 rounded-md text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={`View ${label}`}
        >
          <span className="flex gap-0.5">
            {members.slice(0, shownAvatars).map((person) => (
              <PersonAvatar
                key={person.actorId}
                name={person.name}
                image={person.image}
                agent={person.type === "agent"}
              />
            ))}
          </span>
          <span className="whitespace-nowrap tabular-nums">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8}>
        <p className="px-2 text-sm font-medium">Members</p>
        <ul aria-label="Conversation members" className="max-h-64 space-y-1 overflow-y-auto">
          {members.map((person) => (
            <li key={person.actorId} className="flex items-center gap-2 rounded-md px-2 py-1">
              <PersonAvatar
                name={person.name}
                image={person.image}
                agent={person.type === "agent"}
              />
              <span className="min-w-0 flex-1 text-sm wrap-anywhere">{person.name}</span>
              {person.type === "agent" && <Tag>Agent</Tag>}
              {person.external && <Tag>External</Tag>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// Admins see names and members only. Nothing here opens the messages.
export function ManagedConversations({
  rows,
  state,
  loading,
  error,
  onRetry,
  onAddMembers,
  onTransfer,
  onDelete,
}: {
  rows?: ManagedConversationRow[];
  state: ResourceStatus;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onAddMembers: (id: string) => void;
  onTransfer: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (state === "error" || state === "unavailable")
    return (
      <ErrorState
        title={
          state === "unavailable" ? "Conversations unavailable" : "Couldn’t load conversations"
        }
        description={
          state === "unavailable"
            ? "Check that you still have access to this workspace."
            : "Check your connection and try again."
        }
        onRetry={state === "unavailable" ? undefined : onRetry}
      />
    );
  const loadingRows = loading && !rows;
  if (!loadingRows && !rows?.length && !error)
    return (
      <div className="rounded-xl border">
        <ContentNotice
          icon={Hash}
          title="No channels or group messages"
          description="Channels and group messages people create in this organization appear here."
        />
      </div>
    );
  return (
    <div className="space-y-3">
      {state === "stale" && (
        <StaleNotice onRetry={onRetry}>This list may be out of date.</StaleNotice>
      )}
      <div
        className="overflow-hidden rounded-xl border bg-card"
        role={loadingRows ? "status" : undefined}
        aria-label={loadingRows ? "Loading conversations" : undefined}
      >
        <Table aria-label="Channels and group messages">
          <TableHeader>
            <TableRow>
              <TableHead>Conversation</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRows &&
              [0, 1, 2].map((key) => (
                <ManagedConversationCells
                  key={key}
                  hidden
                  conversation={<SkeletonText width="10rem" />}
                  owner={<SkeletonText width="7rem" />}
                  members={<SkeletonText width="8rem" />}
                />
              ))}
            {rows?.map((row) => {
              const name = row.name ?? "Group message";
              return (
                <ManagedConversationCells
                  key={row.id}
                  conversation={
                    <span className="flex min-w-0 items-center gap-2">
                      <KindIcon row={row} />
                      <span className="truncate font-medium">{name}</span>
                    </span>
                  }
                  owner={<span className="text-muted-foreground">{row.ownerName}</span>}
                  members={<MemberSummary members={row.members} />}
                  actions={
                    <RowActions label={`${name} actions`} className="justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Add people to ${name}`}
                            onClick={() => onAddMembers(row.id)}
                          >
                            <UserPlus aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add people</TooltipContent>
                      </Tooltip>
                      <ConversationActionsMenu
                        deleteLabel={row.kind === "channel" ? "Delete channel" : "Delete group"}
                        onTransfer={() => onTransfer(row.id)}
                        onDelete={() => onDelete(row.id)}
                      />
                    </RowActions>
                  }
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ManagedConversationCells({
  conversation,
  owner,
  members,
  actions,
  hidden,
}: {
  conversation: React.ReactNode;
  owner: React.ReactNode;
  members: React.ReactNode;
  actions?: React.ReactNode;
  hidden?: boolean;
}) {
  return (
    <TableRow className="group/row" aria-hidden={hidden}>
      <TableCell className="max-w-64">{conversation}</TableCell>
      <TableCell>{owner}</TableCell>
      <TableCell>{members}</TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}
