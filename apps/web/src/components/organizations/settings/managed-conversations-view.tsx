import type { ReactNode } from "react";

import { PaneState } from "@/components/feedback/pane-state";
import { ConversationActionsMenu } from "@/components/messaging/conversations/actions/conversation-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Hash, LockKeyhole, UserPlus, Users } from "lucide-react";

export interface ManagedConversationRow {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string | null;
  private: boolean;
  ownerName: string;
  members: { userId: string; name: string }[];
}

function KindIcon({ row }: { row: ManagedConversationRow }) {
  if (row.kind === "group") return <Users className="size-4" aria-label="Group message" />;
  if (row.private) return <LockKeyhole className="size-4" aria-label="Private channel" />;
  return <Hash className="size-4" aria-label="Public channel" />;
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
  addMembersFor,
  addMembersForm,
}: {
  rows?: ManagedConversationRow[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onAddMembers: (id: string) => void;
  onTransfer: (id: string) => void;
  onDelete: (id: string) => void;
  addMembersFor?: string;
  addMembersForm?: ReactNode;
}) {
  if (error && !rows)
    return <PaneState label="Conversations unavailable" error={error} onRetry={onRetry} />;
  if (loading && !rows) return <PaneState label="Loading conversations…" />;
  if (!rows?.length)
    return (
      <p className="text-sm text-muted-foreground">There are no channels or group messages.</p>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Manage every channel and group message in this organization. Private messages stay private:
        you see names and members, not messages.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Conversation</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="w-24 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <span className="flex min-w-0 items-center gap-2">
                  <KindIcon row={row} />
                  <span className="truncate">{row.name ?? "Group message"}</span>
                </span>
                {addMembersFor === row.id && <div className="pt-2">{addMembersForm}</div>}
              </TableCell>
              <TableCell>{row.ownerName}</TableCell>
              <TableCell>
                <span className="block max-w-48 truncate">
                  {row.members.map((person) => person.name).join(", ")}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Add people to ${row.name ?? "group message"}`}
                    onClick={() => onAddMembers(row.id)}
                  >
                    <UserPlus />
                  </Button>
                  <ConversationActionsMenu
                    onTransfer={() => onTransfer(row.id)}
                    onDelete={() => onDelete(row.id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
