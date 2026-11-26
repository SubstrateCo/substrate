import type { ReactNode } from "react";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { PersonAvatarFallback } from "@/components/people/person-avatar";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { roleLabel } from "@/lib/organizations/member-policy";
import { Bot, LockKeyhole } from "lucide-react";

export type PersonCardProfile = {
  name: string;
  type: "human" | "agent";
  self: boolean;
  external: boolean;
  email: string | null;
  image: string | null;
  role: string | null;
  agent: { ownerName: string | null; harness: string | null; model: string | null } | null;
};

function agentLine(agent: NonNullable<PersonCardProfile["agent"]>) {
  if (!agent.harness) return null;
  return ["Agent", harnessLabel(agent.harness), agent.model].filter(Boolean).join(" · ");
}

function Header({
  name,
  image,
  secondary,
  action,
  tags,
  badge,
  type = "human",
}: {
  name: string;
  image?: string | null;
  secondary: ReactNode;
  action?: ReactNode;
  tags?: ReactNode;
  badge?: ReactNode;
  type?: "human" | "agent";
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar
        aria-hidden="true"
        variant={type === "agent" ? "agent" : "default"}
        className="size-10 shrink-0"
      >
        {image && <AvatarImage src={image} alt="" />}
        <PersonAvatarFallback name={name} agent={type === "agent"} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="font-medium wrap-anywhere">{name}</p>
        {secondary}
        {tags && <div className="mt-1 flex flex-wrap gap-1">{tags}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}

/** Identity already visible on the source record, without loading private profile details. */
export function PersonIdentityCard({
  name,
  image,
  type,
}: {
  name: string;
  image?: string | null;
  type: "human" | "agent";
}) {
  return (
    <Header
      name={name}
      image={image}
      type={type}
      secondary={
        <p className="text-xs text-muted-foreground">{type === "agent" ? "Agent" : "Person"}</p>
      }
    />
  );
}

export function PersonCard({
  state,
  name,
  profile,
  action,
}: {
  state: "loading" | "unavailable" | "ready";
  /** The name the viewer already sees where the card opened. */
  name: string;
  profile?: PersonCardProfile;
  action?: ReactNode;
}) {
  if (state === "loading")
    return (
      <div role="status" aria-label={`Loading details for ${name}`} className="space-y-3">
        <Header
          name={name}
          secondary={
            <p aria-hidden="true" className="text-xs">
              <SkeletonText width="8rem" />
            </p>
          }
        />
      </div>
    );
  if (state === "unavailable" || !profile)
    return (
      <Header
        name={name}
        secondary={
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3" />
            Details unavailable
          </p>
        }
      />
    );
  const secondary = profile.agent ? agentLine(profile.agent) : profile.email;
  const tags = [
    profile.role && <Tag key="role">{roleLabel(profile.role)}</Tag>,
    profile.external && <Tag key="external">External</Tag>,
    profile.self && <Tag key="self">You</Tag>,
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <Header
        name={profile.name}
        type={profile.type}
        image={profile.image}
        action={action}
        tags={tags.length ? tags : undefined}
        badge={
          profile.type === "agent" && (
            <Tag icon={<Bot aria-hidden="true" className="size-3" />}>Agent</Tag>
          )
        }
        secondary={
          secondary && <p className="text-xs wrap-anywhere text-muted-foreground">{secondary}</p>
        }
      />
      {profile.agent?.ownerName && (
        <p className="text-xs wrap-anywhere text-muted-foreground">
          Owned by <span className="font-medium text-foreground">{profile.agent.ownerName}</span>
        </p>
      )}
    </div>
  );
}
