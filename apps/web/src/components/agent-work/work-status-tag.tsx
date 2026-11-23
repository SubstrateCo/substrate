import { Tag, type TagTone } from "@/components/feedback/tag";
import type { WorkStatus } from "@/lib/agent-work/status";
import { Check, CircleAlert, Hand, Minus, Square, type LucideIcon } from "lucide-react";

const tones: Record<WorkStatus["tone"], { tone: TagTone; icon?: LucideIcon }> = {
  working: { tone: "working" },
  done: { tone: "success", icon: Check },
  failed: { tone: "destructive", icon: CircleAlert },
  attention: { tone: "warning", icon: Hand },
  idle: { tone: "default", icon: Square },
  muted: { tone: "default", icon: Minus },
};

/**
 * A turn's state as words and an icon, so color is never the only signal. The label comes from
 * `turnLabel`, such as "Worked for 2m 00s" or "Stopped · needs you".
 */
export function WorkStatusTag({ status }: { status: WorkStatus }) {
  const { tone, icon: Icon } = tones[status.tone];
  return (
    <Tag
      tone={tone}
      icon={Icon && <Icon aria-hidden="true" className="size-3 shrink-0" />}
      className="tabular-nums"
    >
      <span className="truncate">{status.label}</span>
    </Tag>
  );
}
