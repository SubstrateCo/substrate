import { PersonAvatar } from "@/components/people/person-avatar";
import { cn } from "cn";

/** A small avatar for a task assignee. No name shows an empty dashed circle. */
export function TaskAssigneeAvatar({
  name,
  image,
  type,
  className,
}: {
  name?: string;
  image?: string | null;
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
    <PersonAvatar
      name={name}
      image={image}
      agent={type === "agent"}
      size="xs"
      className={className}
    />
  );
}
