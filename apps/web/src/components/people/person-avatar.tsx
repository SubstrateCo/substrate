import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { UserRound } from "lucide-react";

const personAvatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-6",
      xs: "size-5",
      md: "size-8",
      lg: "size-9",
      xl: "size-10",
    },
  },
  defaultVariants: { size: "sm" },
});

export type PersonAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export function PersonAvatar({
  name,
  image,
  size = "sm",
  className,
}: {
  name?: string;
  image?: string | null;
  size?: PersonAvatarSize;
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
    <Avatar
      aria-hidden="true"
      size={size === "sm" || size === "xs" ? size : "default"}
      className={cn(personAvatarVariants({ size }), className)}
    >
      {image && <AvatarImage src={image} alt="" />}
      <PersonAvatarFallback name={name} />
    </Avatar>
  );
}

function PersonAvatarFallback({ name }: { name?: string }) {
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
