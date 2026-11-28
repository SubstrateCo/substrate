import { AgentAvatar, decodeAvatarCode } from "@substrate/agent-avatars";
import type { AmbientLevel, Mood } from "@substrate/agent-avatars/config";
import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { useMemo } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { Bot } from "lucide-react";

const agentAvatarSizes = { xs: 20, sm: 24, md: 32, lg: 36, xl: 40, "2xl": 96 } as const;
export type AgentAvatarSize = keyof typeof agentAvatarSizes;

const DRAWING_SCALE = 1.4;

const boxVariants = cva("", {
  variants: {
    size: {
      xs: "size-5",
      sm: "size-6",
      md: "size-8",
      lg: "size-9",
      xl: "size-10",
      "2xl": "size-24",
    },
  },
  defaultVariants: { size: "sm" },
});

export function AgentAvatarView({
  avatar,
  mood,
  size = "sm",
  ambient = size === "xs" ? "off" : "subtle",
  animated = true,
  interactive = false,
  label,
  className,
}: {
  avatar: AgentAvatarCode | null;
  mood?: Mood;
  size?: AgentAvatarSize;
  ambient?: AmbientLevel;
  animated?: boolean;
  interactive?: boolean;
  label?: string;
  className?: string;
}) {
  const look = useMemo(() => (avatar ? decodeAvatarCode(avatar) : null), [avatar]);
  if (!look)
    return (
      <Avatar
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        variant="agent"
        size="sm"
        className={cn(boxVariants({ size }), className)}
      >
        <AvatarFallback>
          <Bot aria-hidden="true" className="size-3.5 group-data-[size=default]/avatar:size-5" />
        </AvatarFallback>
      </Avatar>
    );
  return (
    <span
      data-slot="agent-avatar"
      className={cn("relative inline-block shrink-0", boxVariants({ size }), className)}
    >
      <AgentAvatar
        {...look}
        mood={mood}
        size={Math.round(agentAvatarSizes[size] * DRAWING_SCALE)}
        ambient={ambient}
        animated={animated}
        interactive={interactive}
        outline
        label={label}
        className="absolute top-1/2 left-1/2 -translate-1/2"
      />
    </span>
  );
}
