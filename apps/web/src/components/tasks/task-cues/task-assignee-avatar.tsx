import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cn } from "cn";
import { Bot } from "lucide-react";

/** A small avatar for a task assignee. No name shows an empty dashed circle. */
export function TaskAssigneeAvatar({
  name,
  type,
  className,
}: {
  name?: string;
  type?: "human" | "agent";
  className?: string;
}) {
  if (!name)
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/50",
          className,
        )}
      />
    );
  return (
    <Avatar aria-hidden="true" size="sm" className={cn("size-5", className)}>
      <AvatarFallback>
        {type === "agent" ? <Bot className="size-3" /> : initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
