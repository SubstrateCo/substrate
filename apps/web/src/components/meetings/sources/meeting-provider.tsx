import { providerNames, type MeetingProvider } from "@substrate/contracts/meetings";

import { Button } from "@/components/ui/button";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { AudioLines, Hexagon, NotebookPen, Pencil, Video } from "lucide-react";

const marks = {
  manual: { icon: Pencil, color: "text-primary", fill: "bg-primary/10" },
  meet: { icon: Video, color: "text-chart-2", fill: "bg-chart-2/15" },
  granola: { icon: NotebookPen, color: "text-chart-5", fill: "bg-chart-5/15" },
  fathom: { icon: AudioLines, color: "text-chart-1", fill: "bg-chart-1/15" },
  hex: { icon: Hexagon, color: "text-chart-3", fill: "bg-chart-3/15" },
};

const providerMarkVariants = cva("inline-grid shrink-0 place-items-center", {
  variants: {
    size: {
      row: "size-4.5 rounded-md",
      nav: "size-5.5 rounded-md",
      record: "size-8 rounded-lg",
    },
  },
  defaultVariants: { size: "nav" },
});

const providerMarkIconVariants = cva("", {
  variants: {
    size: {
      row: "size-3",
      nav: "size-3.5",
      record: "size-4.75",
    },
  },
  defaultVariants: { size: "nav" },
});

export function ProviderMark({
  provider,
  size = "nav",
}: {
  provider: MeetingProvider;
  size?: "row" | "nav" | "record";
}) {
  const { icon: Icon, color, fill } = marks[provider];
  return (
    <span aria-hidden="true" className={cn(providerMarkVariants({ size }), color, fill)}>
      <Icon className={providerMarkIconVariants({ size })} />
    </span>
  );
}

export function OriginalBadge({
  provider,
  onClick,
}: {
  provider: MeetingProvider;
  onClick: () => void;
}) {
  const { icon: Icon, color } = marks[provider];
  return (
    <Button size="xs" variant="outline" onClick={onClick}>
      <Icon aria-hidden="true" className={cn("size-3", color)} />
      {providerNames[provider]}
    </Button>
  );
}
