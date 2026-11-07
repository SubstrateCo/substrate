import type { ProjectDetail } from "../types";
import { Button } from "@/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/ui/primitives/item";
import { Bot, UserRound } from "lucide-react";

export function ProjectMembers({
  members,
  canManage,
  pending,
  onRevoke,
}: {
  members: ProjectDetail["members"];
  canManage: boolean;
  pending: boolean;
  onRevoke: (actorEntityId: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {members.map((member) => (
        <li key={member.actorEntityId}>
          <Item size="xs">
            <ItemMedia variant="icon">
              {member.type === "agent" ? (
                <Bot aria-hidden="true" />
              ) : (
                <UserRound aria-hidden="true" />
              )}
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">
                <span className="line-clamp-2 wrap-anywhere" title={member.name}>
                  {member.name}
                </span>
              </ItemTitle>
              <ItemDescription>
                {member.level[0]!.toUpperCase() + member.level.slice(1)} access
              </ItemDescription>
            </ItemContent>
            {canManage && (
              <ItemActions>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remove ${member.name}`}
                  onClick={() => onRevoke(member.actorEntityId)}
                >
                  Remove
                </Button>
              </ItemActions>
            )}
          </Item>
        </li>
      ))}
    </ul>
  );
}
