import { useRef } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PaneState } from "@/components/feedback/pane-state";
import { isAccessFailure } from "@/components/feedback/request-failure";
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
import { Hash, LockKeyhole, UserPlus, Users } from "lucide-react";

export interface ManagedConversationRow {
  id: string;
  kind: "dm" | "group" | "channel";
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
                key={`${person.type}-${person.name}`}
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
          {members.map((person, index) => (
            <li
              key={`${person.type}-${person.name}-${index}`}
              className="flex items-center gap-2 rounded-md px-2 py-1"
            >
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
  loading,
  error,
  onRetry,
  onAddMembers,
  onTransfer,
  onDelete,
}: {
  rows?: ManagedConversationRow[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onAddMembers: (id: string, launcher: HTMLElement | null) => void;
  onTransfer: (id: string, launcher: HTMLElement | null) => void;
  onDelete: (id: string, launcher: HTMLElement | null) => void;
}) {
  const menuTriggers = useRef(new Map<string, HTMLButtonElement>());
  if (error && (!rows || isAccessFailure(error)))
    return (
      <PaneState
        label="Conversations unavailable"
        error={error}
        onRetry={isAccessFailure(error) ? undefined : onRetry}
      />
    );
  if (loading && !rows) return <PaneState label="Loading conversations." />;
  if (!rows?.length && !error)
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
      {error && (
        <ErrorState
          compact
          title="Couldn’t refresh conversations"
          description="This list may be out of date."
          onRetry={onRetry}
        />
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
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
            {rows?.map((row) => {
              const name = row.name ?? "Group message";
              return (
                <TableRow key={row.id} className="group/row">
                  <TableCell className="max-w-64">
                    <span className="flex min-w-0 items-center gap-2">
                      <KindIcon row={row} />
                      <span className="truncate font-medium">{name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{row.ownerName}</span>
                  </TableCell>
                  <TableCell>
                    <MemberSummary members={row.members} />
                  </TableCell>
                  <TableCell>
                    <RowActions label={`${name} actions`} className="justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Add people to ${name}`}
                            onClick={(event) => onAddMembers(row.id, event.currentTarget)}
                          >
                            <UserPlus aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add people</TooltipContent>
                      </Tooltip>
                      <ConversationActionsMenu
                        triggerRef={(element) => {
                          if (element) menuTriggers.current.set(row.id, element);
                          else menuTriggers.current.delete(row.id);
                        }}
                        deleteLabel={row.kind === "channel" ? "Delete channel" : "Delete group"}
                        onTransfer={() =>
                          onTransfer(row.id, menuTriggers.current.get(row.id) ?? null)
                        }
                        onDelete={() => onDelete(row.id, menuTriggers.current.get(row.id) ?? null)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
