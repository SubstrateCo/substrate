import type { ReactElement } from "react";

import type { ProjectDetail } from "../types";
import { PersonIdentityCard } from "@/components/messaging/people/person-card-view";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function TaskAssigneeHoverCard({
  assignee,
  children,
}: {
  assignee: ProjectDetail["actors"][number];
  children: ReactElement;
}) {
  return (
    <HoverCard openDelay={400} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Assigned to ${assignee.name}`}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="end" collisionPadding={8} className="w-76">
        <PersonIdentityCard name={assignee.name} image={assignee.image} type={assignee.type} />
      </HoverCardContent>
    </HoverCard>
  );
}
