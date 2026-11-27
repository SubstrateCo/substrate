import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { UserRound } from "lucide-react";

const personAvatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-6",
      // `Avatar` sets `data-[size=sm]:size-6`, which outranks a plain size class. The same
      // variant replaces it.
      xs: "size-5 data-[size=sm]:size-5",
    },
  },
  defaultVariants: { size: "sm" },
});

/**
 * A person in rows, chips, and pickers: 24px, or 20px for `xs`. A person is a circle with
 * initials on the neutral fill. No name, such as an unassigned task, shows an empty dashed
 * circle. Agents use `AgentAvatarView`.
 */
export function PersonAvatar({
  name,
  image,
  size = "sm",
  className,
}: {
  name?: string;
  image?: string | null;
  size?: "sm" | "xs";
  className?: string;
}) {
  if (!name && !image)
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
    <Avatar aria-hidden="true" size="sm" className={cn(personAvatarVariants({ size }), className)}>
      {image && <AvatarImage src={image} alt="" />}
      <PersonAvatarFallback name={name} />
    </Avatar>
  );
}

export function PersonAvatarFallback({ name }: { name?: string }) {
  return (
    <AvatarFallback>
      {name?.trim() ? (
        initials(name)
      ) : (
        <UserRound
          aria-hidden="true"
          className="size-3.5 group-data-[size=default]/avatar:size-5"
        />
      )}
    </AvatarFallback>
  );
}
