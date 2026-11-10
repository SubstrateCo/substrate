import type { ReactNode } from "react";

import { Tag } from "@/components/feedback/tag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { initials } from "@/lib/people/initials";
import { Bot, LockKeyhole, User } from "lucide-react";

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

function roleLabel(role: string) {
  const first = role.split(",")[0]!.trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function Header({
  name,
  image,
  secondary,
}: {
  name: string;
  image?: string | null;
  secondary: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar aria-hidden="true" variant="message" className="size-10">
        {image && <AvatarImage src={image} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        {secondary}
      </div>
    </div>
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
      <div role="status" aria-label={`Loading details for ${name}…`} className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-lg">
            <Skeleton className="size-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-5 w-16" />
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
  const TypeIcon = profile.type === "agent" ? Bot : User;
  return (
    <div className="space-y-3">
      <Header
        name={profile.name}
        image={profile.image}
        secondary={
          secondary && <p className="truncate text-xs text-muted-foreground">{secondary}</p>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="inline-flex items-center gap-1">
          <TypeIcon aria-hidden="true" className="size-3" />
          {profile.type === "agent" ? "Agent" : "Person"}
        </Tag>
        {profile.role && <Tag>{roleLabel(profile.role)}</Tag>}
        {profile.external && <Tag>External</Tag>}
        {profile.self && <Tag>You</Tag>}
      </div>
      {profile.agent?.ownerName && (
        <p className="truncate text-xs text-muted-foreground">
          Owned by <span className="font-medium text-foreground">{profile.agent.ownerName}</span>
        </p>
      )}
      {action}
    </div>
  );
}
