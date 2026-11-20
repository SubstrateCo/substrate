import { useRef, type ReactNode } from "react";

import { ConversationOrganizations, type ChannelOrganization } from "./conversation-organizations";
import { Tag } from "@/components/feedback/tag";
import { PageHeader } from "@/components/layout/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Hash, ListTodo, LockKeyhole, MessageCircle, UserPlus, Users } from "lucide-react";

export type HeaderMember = {
  actorId: string;
  userId: string | null;
  name: string;
  image?: string | null;
  type: "human" | "agent";
  external?: boolean;
  organizationId: string;
};

const kindIcons = {
  private: <LockKeyhole aria-hidden="true" />,
  public: <Hash aria-hidden="true" />,
  group: <Users aria-hidden="true" />,
  dm: <MessageCircle aria-hidden="true" />,
};

function MemberAvatar({ member }: { member: HeaderMember }) {
  return <PersonAvatar name={member.name} image={member.image} agent={member.type === "agent"} />;
}

/** Who can read here: a count that opens the member list. */
function MembersButton({
  members,
  organizations,
  memberAction,
}: {
  members: HeaderMember[];
  organizations: ChannelOrganization[];
  memberAction?: (member: HeaderMember) => ReactNode;
}) {
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
          {[...organizations]
            .sort((a, b) => Number(b.own) - Number(a.own))
            .flatMap((org) => [
              <li key={org.id} className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {org.name}
                {org.own && " · Your organization"}
              </li>,
              ...members
                .filter((member) => member.organizationId === org.id)
                .map((member) => (
                  <li
                    key={member.actorId}
                    className="group/row flex h-9 items-center gap-2 rounded-md px-2 text-sm"
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
                    {memberAction?.(member)}
                  </li>
                )),
            ])}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ConversationHeader({
  title,
  kind,
  viewerId,
  members = [],
  organizations = [],
  addingMembers,
  onToggleMembers,
  actions,
  memberAction,
  taskLink,
}: {
  title: ReactNode;
  /** Omitted while the conversation is unavailable. */
  kind?: "private" | "public" | "group" | "dm";
  viewerId?: string;
  members?: HeaderMember[];
  organizations?: ChannelOrganization[];
  addingMembers: boolean;
  onToggleMembers?: () => void;
  actions?: ReactNode;
  memberAction?: (member: HeaderMember) => ReactNode;
  taskLink?: ReactNode;
}) {
  const dmMembers =
    kind === "dm" ? members.filter((member) => !viewerId || member.userId !== viewerId) : [];
  const dmPartner = dmMembers.length === 1 ? dmMembers[0] : undefined;
  let icon = kind && kindIcons[kind];
  if (dmPartner) icon = <MemberAvatar member={dmPartner} />;
  if (taskLink) icon = <ListTodo aria-hidden="true" />;
  return (
    <PageHeader
      variant="pane"
      title={taskLink ?? title}
      icon={icon}
      actions={
        <>
          {!taskLink && organizations.length > 1 && (
            <ConversationOrganizations organizations={organizations} members={members} />
          )}
          {!taskLink && members.length > 0 && kind !== "dm" && (
            <MembersButton
              members={members}
              organizations={organizations}
              memberAction={memberAction}
            />
          )}
          {!taskLink && onToggleMembers && (
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
