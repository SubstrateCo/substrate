import { providerNames, type MeetingProvider } from "@substrate/contracts/meetings";

import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { AudioLines, Hexagon, NotebookPen, Pencil, Video } from "lucide-react";

const marks = {
  manual: { icon: Pencil, color: "text-primary", fill: "bg-primary/10" },
  meet: { icon: Video, color: "text-chart-2", fill: "bg-chart-2/15" },
  granola: { icon: NotebookPen, color: "text-chart-5", fill: "bg-chart-5/15" },
  fathom: { icon: AudioLines, color: "text-chart-1", fill: "bg-chart-1/15" },
  hex: { icon: Hexagon, color: "text-chart-3", fill: "bg-chart-3/15" },
};

export function ProviderMark({
  provider,
  size = "nav",
}: {
  provider: MeetingProvider;
  size?: "row" | "nav" | "record";
}) {
  const { icon: Icon, color, fill } = marks[provider];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center",
        color,
        fill,
        size === "record" ? "size-8 rounded-lg" : "rounded-md",
        size === "row" && "size-4.5",
        size === "nav" && "size-5.5",
      )}
    >
      <Icon
        className={cn(
          size === "row" && "size-3",
          size === "nav" && "size-3.5",
          size === "record" && "size-4.75",
        )}
      />
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
