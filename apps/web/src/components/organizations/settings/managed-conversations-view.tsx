import { ContentNotice } from "@/components/feedback/content-notice";
import { PaneState } from "@/components/feedback/pane-state";
import { ConversationActionsMenu } from "@/components/messaging/conversations/actions/conversation-actions-menu";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
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

/** A few avatars and a count. The full list is in the tooltip, so names never truncate. */
function MemberSummary({ members }: { members: ConversationMember[] }) {
  const names = members.map((person) =>
    person.type === "agent" ? `${person.name} (agent)` : person.name,
  );
  const label = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={`${label}: ${names.join(", ")}`}
        >
          <span className="flex gap-0.5">
            {members.slice(0, shownAvatars).map((person) => (
              <PersonAvatar
                key={`${person.type}-${person.name}`}
                name={person.name}
                agent={person.type === "agent"}
              />
            ))}
          </span>
          <span className="whitespace-nowrap tabular-nums">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{names.join(", ")}</TooltipContent>
    </Tooltip>
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
  onAddMembers: (id: string) => void;
  onTransfer: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (error && !rows)
    return <PaneState label="Conversations unavailable" error={error} onRetry={onRetry} />;
  if (loading && !rows) return <PaneState label="Loading conversations." />;
  if (!rows?.length)
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
          {rows.map((row) => {
            const name = row.name ?? "Group message";
            return (
              <TableRow key={row.id}>
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
                  <div
                    role="group"
                    aria-label={`${name} actions`}
                    className="flex justify-end gap-0.5"
                  >
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
                      onTransfer={() => onTransfer(row.id)}
                      onDelete={() => onDelete(row.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
