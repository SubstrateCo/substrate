import { useRef, type ReactNode } from "react";

import { Tag } from "@/components/feedback/tag";
import { PageHeader } from "@/components/layout/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe, Hash, LockKeyhole, MessageCircle, UserPlus, Users } from "lucide-react";

export type HeaderMember = {
  actorId: string;
  name: string;
  type: "human" | "agent";
  external?: boolean;
};

const kindIcons = {
  private: <LockKeyhole aria-hidden="true" />,
  public: <Hash aria-hidden="true" />,
  group: <Users aria-hidden="true" />,
  dm: <MessageCircle aria-hidden="true" />,
};

function MemberAvatar({ member }: { member: HeaderMember }) {
  return <PersonAvatar name={member.name} agent={member.type === "agent"} />;
}

/** Who can read here: a count that opens the member list. */
function MembersButton({ members }: { members: HeaderMember[] }) {
  const label = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  const list = useRef<HTMLUListElement>(null);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="disclosure" size="sm" aria-label={`Members, ${label}`}>
              <Users aria-hidden="true" />
              <span className="tabular-nums">{members.length}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Members</TooltipContent>
      </Tooltip>
      <PopoverContent
        variant="reference"
        align="end"
        className="w-72"
        aria-label="Members"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          list.current?.focus();
        }}
      >
        <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{label}</p>
        <ul ref={list} tabIndex={-1} className="max-h-80 overflow-y-auto p-1 outline-none">
          {members.map((member) => (
            <li
              key={member.actorId}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sm"
            >
              <MemberAvatar member={member} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="min-w-0 flex-1 truncate rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                    tabIndex={0}
                  >
                    {member.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{member.name}</TooltipContent>
              </Tooltip>
              {member.type === "agent" && <Tag>Agent</Tag>}
              {member.external && <Tag>External</Tag>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ConversationHeader({
  title,
  kind,
  members = [],
  partner = false,
  addingMembers,
  onToggleMembers,
  actions,
}: {
  title: string;
  /** Omitted while the conversation is unavailable. */
  kind?: "private" | "public" | "group" | "dm";
  members?: HeaderMember[];
  /** People from another organization can read this conversation. */
  partner?: boolean;
  addingMembers: boolean;
  onToggleMembers?: () => void;
  actions?: ReactNode;
}) {
  const dmPartner = kind === "dm" && members.length === 1 ? members[0] : undefined;
  return (
    <PageHeader
      variant="pane"
      className="bg-card/60"
      title={title}
      icon={dmPartner ? <MemberAvatar member={dmPartner} /> : kind && kindIcons[kind]}
      actions={
        <>
          {partner && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="mr-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Globe aria-hidden="true" className="size-3" />
                  External
                </span>
              </TooltipTrigger>
              <TooltipContent>
                People from another organization can read this conversation
              </TooltipContent>
            </Tooltip>
          )}
          {members.length > 0 && kind !== "dm" && <MembersButton members={members} />}
          {onToggleMembers && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggleMembers}
                  aria-label="Add people"
                  aria-expanded={addingMembers}
                >
                  <UserPlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add people</TooltipContent>
            </Tooltip>
          )}
          {actions}
        </>
      }
    />
  );
}
