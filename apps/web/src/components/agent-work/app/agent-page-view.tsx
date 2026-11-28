import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { toneText } from "@/components/feedback/tag-styles";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { AgentView } from "@/lib/agent-work/agent-sections";
import type { AgentHeaderStatus } from "@/lib/agent-work/status";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { CircleAlert, MonitorOff, Settings } from "lucide-react";

const viewOptions = [
  { value: "messages", label: "Messages" },
  { value: "work", label: "Work" },
] as const satisfies readonly { value: AgentView; label: string }[];

function HeaderStatusIcon({ status }: { status: AgentHeaderStatus }) {
  if (status.mood) return null;
  if (status.tone === "attention")
    return <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />;
  return <MonitorOff aria-hidden="true" className="size-3.5 shrink-0" />;
}

function HeaderStatus({
  status,
  elsewhere,
}: {
  status: AgentHeaderStatus;
  elsewhere?: { link: RecordLink; label: string };
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <HeaderStatusIcon status={status} />
      <span className={cn("shrink-0", toneText[status.tone])}>{status.label}</span>
      {elsewhere && (
        <span className="flex min-w-0 gap-1">
          in
          <Link
            {...elsewhere.link}
            className="truncate font-medium text-foreground hover:underline"
          >
            {elsewhere.label}
          </Link>
        </span>
      )}
    </span>
  );
}

export function AgentPageView({
  name,
  avatar,
  status,
  elsewhere,
  view,
  onViewChange,
  settingsOpen,
  onSettingsChange,
  messages,
  work,
}: {
  name: ReactNode;
  avatar: AgentAvatarCode;
  status?: AgentHeaderStatus | null;
  elsewhere?: { link: RecordLink; label: string };
  view: AgentView;
  onViewChange: (view: AgentView) => void;
  settingsOpen: boolean;
  onSettingsChange: (open: boolean) => void;
  messages: ReactNode;
  work: ReactNode;
}) {
  return (
    <section aria-label="Agent" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <PageHeader
        variant="pane"
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate">{name}</span>
            {status && <HeaderStatus status={status} elsewhere={elsewhere} />}
          </span>
        }
        leading={
          <AgentAvatarView
            avatar={avatar}
            size="md"
            mood={status?.mood ?? undefined}
            ambient="lively"
            interactive
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-label="Agent view"
              value={view}
              options={viewOptions}
              onValueChange={onViewChange}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={settingsOpen}
              onClick={() => onSettingsChange(!settingsOpen)}
            >
              <Settings aria-hidden="true" />
              Settings
            </Button>
          </div>
        }
      />
      {view === "messages" ? (
        <div className="flex min-h-0 flex-1 flex-col">{messages}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-4xl">{work}</div>
        </div>
      )}
    </section>
  );
}
