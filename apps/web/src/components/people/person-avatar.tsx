import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { Bot, UserRound } from "lucide-react";

const personAvatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-6",
      xs: "size-5",
    },
  },
  defaultVariants: { size: "sm" },
});

/**
 * A person or agent in rows, chips, and pickers: 24px, or 20px for `xs`. A person is a circle
 * with initials; an agent is a rounded square with the Bot mark. Both use the neutral fill.
 * No name, such as an unassigned task, shows an empty dashed circle.
 */
export function PersonAvatar({
  name,
  image,
  agent = false,
  size = "sm",
  className,
}: {
  name?: string;
  image?: string | null;
  agent?: boolean;
  size?: "sm" | "xs";
  className?: string;
}) {
  if (!name && !agent && !image)
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block shrink-0 rounded-full border border-dashed border-muted-foreground/50",
          personAvatarVariants({ size }),
          className,
        )}
      />
    );
  return (
    <Avatar
      aria-hidden="true"
      variant={agent ? "agent" : "default"}
      size="sm"
      className={cn(personAvatarVariants({ size }), className)}
    >
      {image && <AvatarImage src={image} alt="" />}
      <PersonAvatarFallback name={name} agent={agent} />
    </Avatar>
  );
}

export function PersonAvatarFallback({ name, agent = false }: { name?: string; agent?: boolean }) {
  const Icon = agent ? Bot : UserRound;
  return (
    <AvatarFallback>
      {!agent && name?.trim() ? (
        initials(name)
      ) : (
        <Icon aria-hidden="true" className="size-3.5 group-data-[size=default]/avatar:size-5" />
      )}
    </AvatarFallback>
  );
}
