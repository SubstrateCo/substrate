import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ReactNode } from "react";

import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { ActorAvatar } from "@/components/people/actor-avatar";
import { actorIdentity, actorKindLabel, type ActorIdentity } from "@/lib/actors/identity";
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
  avatar: AgentAvatarCode | null;
  role: string | null;
  agent: { ownerName: string | null; harness: string | null; model: string | null } | null;
};

function agentLine(agent: NonNullable<PersonCardProfile["agent"]>) {
  if (!agent.harness) return null;
  return ["Agent", harnessLabel(agent.harness), agent.model].filter(Boolean).join(" · ");
}

function Header({
  actor,
  secondary,
  action,
  tags,
  badge,
}: {
  actor: ActorIdentity;
  secondary: ReactNode;
  action?: ReactNode;
  tags?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <ActorAvatar actor={actor} size="xl" />
      <div className="min-w-0 flex-1">
        <p className="font-medium wrap-anywhere">{actor.name}</p>
        {secondary}
        {tags && <div className="mt-1 flex flex-wrap gap-1">{tags}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}

export function PersonIdentityCard({ actor }: { actor: ActorIdentity }) {
  return (
    <Header
      actor={actor}
      secondary={<p className="text-xs text-muted-foreground">{actorKindLabel(actor)}</p>}
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
  name: string;
  profile?: PersonCardProfile;
  action?: ReactNode;
}) {
  if (state === "loading")
    return (
      <div role="status" aria-label={`Loading details for ${name}`} className="space-y-3">
        <Header
          actor={actorIdentity({ name })}
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
        actor={actorIdentity({ name })}
        secondary={
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3" />
            Details unavailable
          </p>
        }
      />
    );
  const actor = actorIdentity(profile);
  const secondary = profile.agent ? agentLine(profile.agent) : profile.email;
  const tags = [
    profile.role && <Tag key="role">{roleLabel(profile.role)}</Tag>,
    profile.external && <Tag key="external">External</Tag>,
    profile.self && <Tag key="self">You</Tag>,
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <Header
        actor={actor}
        action={action}
        tags={tags.length ? tags : undefined}
        badge={
          actor.kind === "agent" && (
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
