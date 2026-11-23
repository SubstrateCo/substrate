import type { Mailbox, MailLabel } from "@substrate/contracts/mail";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { defaultLabelColor, ink, labelName, visibleLabels } from "./mail-colors";
import { Tag } from "@/components/feedback/tag";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tags } from "lucide-react";

export function LabelDisplayToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const action = expanded ? "Collapse labels" : "Expand labels";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-expanded={expanded}
          aria-label={action}
          onClick={onToggle}
        >
          <Tags aria-hidden />
          <span className="hidden @lg:inline">Labels</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{action}</TooltipContent>
    </Tooltip>
  );
}

export function LabelTag({ label, wrap = false }: { label: MailLabel; wrap?: boolean }) {
  return (
    <Tag size={wrap ? "default" : "sm"} className="min-w-0">
      <span
        className={`${wrap ? "wrap-anywhere whitespace-normal" : "truncate"} ${ink[label.color ?? defaultLabelColor(label)]}`}
      >
        {labelName(label)}
      </span>
    </Tag>
  );
}
function RowLabels({ labels, all }: { labels: MailLabel[]; all: boolean }) {
  const measure = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(labels.length);
  useLayoutEffect(() => {
    const strip = measure.current;
    if (!strip) return;
    const resize = () => {
      if (!strip.clientWidth) return;
      const widths = Array.from(strip.children, (chip) => chip.getBoundingClientRect().width);
      const more = widths.pop()!;
      const gap = parseFloat(getComputedStyle(strip).columnGap);
      let used = 0,
        count = 1;
      for (const [i, width] of widths.entries()) {
        used += width + (i ? gap : 0);
        if (used + (i + 1 < widths.length ? gap + more : 0) <= strip.clientWidth) count = i + 1;
      }
      setFit(count);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(strip);
    for (const chip of strip.children) observer.observe(chip);
    return () => observer.disconnect();
  }, [labels, all]);
  const count = all ? fit : 1;
  const extra = labels.length - count;
  const counter = "shrink-0 text-xs text-muted-foreground tabular-nums";
  return (
    <span
      aria-label="Labels"
      title={labels.map(labelName).join(", ")}
      className="inline-flex max-w-1/2 min-w-0 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap"
    >
      {all && labels.length > 1 && (
        <span
          ref={measure}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 flex w-1/2 gap-1 overflow-hidden *:max-w-none *:shrink-0"
        >
          {labels.map((l) => (
            <LabelTag key={l.id} label={l} />
          ))}
          <span className={counter}>+{labels.length - 1}</span>
        </span>
      )}
      {labels.slice(0, count).map((l) => (
        <LabelTag key={l.id} label={l} />
      ))}
      {extra > 0 && <span className={counter}>+{extra}</span>}
    </span>
  );
}

export function MessageLabels({
  mailbox,
  ids,
  compact = false,
  all = false,
}: {
  mailbox: Mailbox;
  ids: string[];
  compact?: boolean;
  all?: boolean;
}) {
  const labels = useMemo(() => visibleLabels(mailbox, ids, compact), [mailbox, ids, compact]);
  if (!labels.length) return null;
  if (compact) return <RowLabels labels={labels} all={all} />;
  return (
    <span
      aria-label="Labels"
      className="mt-2 flex flex-wrap gap-1"
      title={labels.map(labelName).join(", ")}
    >
      {labels.map((l) => (
        <LabelTag key={l.id} label={l} wrap />
      ))}
    </span>
  );
}
