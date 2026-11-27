import { agentTriggers } from "@substrate/contracts/agents";

import { RoutineRowLoading } from "@/components/agent-work/routines/routine-row";
import { ConfigurationListLoading } from "@/components/agents/device/configuration-sections";
import {
  RunsOnRow,
  WhenItRunsCard,
} from "@/components/agents/run-settings/agent-run-settings-view";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { SettingsCard, SettingsList, SettingsRow } from "@/components/layout/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentSettingsPage } from "@/lib/agent-work/agent-sections";

function OverviewLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <SettingsCard label="Agent details">
        <div className="grid gap-2">
          <span className="text-sm font-medium">Agent name</span>
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Model</span>
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Additional instructions (optional)</span>
          <Skeleton className="h-56 w-full" />
        </div>
      </SettingsCard>
      <WhenItRunsCard>
        <RunsOnRow
          device={
            <p className="text-sm font-medium">
              <SkeletonText width="12rem" />
            </p>
          }
        />
        {Object.entries(agentTriggers).map(([kind, meta]) => (
          <SettingsRow
            key={kind}
            label={meta.title}
            description={meta.description}
            control={<Skeleton className="h-5 w-9" />}
          />
        ))}
      </WhenItRunsCard>
    </div>
  );
}

export function AgentSettingsLoading({ page }: { page: AgentSettingsPage }) {
  let content;
  if (page === "overview") content = <OverviewLoading />;
  else if (page === "routines")
    content = (
      <SettingsList>
        <RoutineRowLoading />
        <RoutineRowLoading />
      </SettingsList>
    );
  else content = <ConfigurationListLoading section={page} />;
  return (
    <div role="status" aria-label="Loading agent settings">
      <div aria-hidden="true">{content}</div>
    </div>
  );
}
