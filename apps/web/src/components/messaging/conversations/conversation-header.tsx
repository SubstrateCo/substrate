import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { useRef, type ReactNode } from "react";

import { ownOrganizationFirst, type ChannelOrganization } from "./channel-organizations";
import { ConversationKindIcon } from "./conversation-kind-icon";
import { ConversationOrganizations } from "./conversation-organizations";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { Tag } from "@/components/feedback/tag";
import { PageHeader } from "@/components/layout/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConversationVisibility } from "@/lib/messaging/conversations";
import { ListTodo, UserPlus, Users } from "lucide-react";

export type HeaderMember = {
  actorId: string;
  userId: string | null;
  name: string;
  image?: string | null;
  /** Set exactly for an agent. */
  avatar?: AgentAvatarCode | null;
  type: "human" | "agent";
  /** Present only for an agent owned by the viewer. */
  agentId?: string | null;
  external?: boolean;
  organizationId: string;
};

/** Marks the members button, so focus can return to it after the member list closes. */
export const membersButtonSelector = "[data-conversation-members]";

function MemberAvatar({ member }: { member: HeaderMember }) {
  if (member.type === "agent") return <AgentAvatarView avatar={member.avatar ?? null} />;
  return <PersonAvatar name={member.name} image={member.image} />;
}

/** Who can read here: a count that opens the member list. */
function MembersButton({
  members,
  organizations,
  renderMemberAction,
}: {
  members: HeaderMember[];
  organizations: ChannelOrganization[];
  renderMemberAction?: (member: HeaderMember) => ReactNode;
}) {
  const label = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  const list = useRef<HTMLUListElement>(null);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="disclosure"
              size="sm"
              aria-label={`Members, ${label}`}
              data-conversation-members=""
            >
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
          {ownOrganizationFirst(organizations).flatMap((org) => [
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
                        {member.type === "agent" && <span className="sr-only">, Agent</span>}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{member.name}</TooltipContent>
                  </Tooltip>
                  {renderMemberAction?.(member)}
                </li>
              )),
          ])}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** The header's Add people button. The container pairs it with the dialog it opens. */
export function AddPeopleButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label="Add people and agents"
          aria-expanded={expanded}
        >
          <UserPlus />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Add people and agents</TooltipContent>
    </Tooltip>
  );
}

export function ConversationHeader({
  title,
  visibility,
  viewerId,
  members = [],
  organizations = [],
  addMembers,
  actions,
  renderMemberAction,
  taskLink,
}: {
  title: ReactNode;
  /** Omitted while the conversation is unavailable. */
  visibility?: ConversationVisibility;
  viewerId?: string;
  members?: HeaderMember[];
  organizations?: ChannelOrganization[];
  /** The Add people control, when the viewer can add people here. */
  addMembers?: ReactNode;
  actions?: ReactNode;
  renderMemberAction?: (member: HeaderMember) => ReactNode;
  taskLink?: ReactNode;
}) {
  const dm = visibility?.kind === "dm" || visibility?.kind === "agent_dm";
  const dmMembers = dm ? members.filter((member) => !viewerId || member.userId !== viewerId) : [];
  const dmPartner = dmMembers.length === 1 ? dmMembers[0] : undefined;
  let icon = visibility && <ConversationKindIcon {...visibility} />;
  if (dmPartner) icon = <MemberAvatar member={dmPartner} />;
  if (taskLink) icon = <ListTodo aria-hidden="true" />;
  return (
    <PageHeader
      variant="pane"
      title={
        taskLink ??
        (visibility?.kind === "agent_dm" ? (
          <>
            {title} <Tag>Agent DM</Tag>
          </>
        ) : (
          title
        ))
      }
      icon={icon}
      actions={
        <>
          {!taskLink && organizations.length > 1 && (
            <ConversationOrganizations organizations={organizations} members={members} />
          )}
          {!taskLink && members.length > 0 && !dm && (
            <MembersButton
              members={members}
              organizations={organizations}
              renderMemberAction={renderMemberAction}
            />
          )}
          {!taskLink && addMembers}
          {actions}
        </>
      }
    />
  );
}
