import { agentTriggers } from "@substrate/contracts/agents";

import {
  ConfigurationListLoading,
  configurationSections,
} from "@/components/agents/device/configuration-sections";
import {
  GeneralSettingsLayout,
  InstructionsSettingsLayout,
} from "@/components/agents/editors/agent-settings-layout";
import {
  RunsOnCard,
  TriggerCard,
  TriggerRow,
} from "@/components/agents/run-settings/agent-run-settings-view";
import { CallerSettingsLoading } from "@/components/agents/run-settings/caller-settings-view";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { SettingsSection } from "@/components/layout/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentSettingsSection } from "@/lib/agent-work/agent-sections";

export function AgentSettingsLoading({ section }: { section: AgentSettingsSection }) {
  let content;
  if (section === "general") {
    content = (
      <GeneralSettingsLayout
        profile={
          <div className="grid gap-2">
            <span className="text-sm font-medium">Agent name</span>
            <Skeleton className="h-9 w-full" />
          </div>
        }
        model={<Skeleton className="h-9 w-full" />}
      />
    );
  } else if (section === "instructions") {
    content = (
      <InstructionsSettingsLayout>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Additional instructions (optional)</span>
            <p className="text-sm">
              <SkeletonText width="20rem" />
            </p>
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </InstructionsSettingsLayout>
    );
  } else if (section === "skills" || section === "mcps") {
    content = (
      <SettingsSection
        title={configurationSections[section].title}
        description={configurationSections[section].description}
      >
        <ConfigurationListLoading section={section} />
      </SettingsSection>
    );
  } else {
    content = (
      <SettingsSection
        title="Run settings"
        description="Choose where this agent runs and which messages start it."
      >
        <RunsOnCard>
          <p className="text-sm font-medium">
            <SkeletonText width="12rem" />
          </p>
        </RunsOnCard>
        <CallerSettingsLoading />
        <TriggerCard>
          {Object.entries(agentTriggers).map(([kind, meta]) => (
            <TriggerRow
              key={kind}
              label={meta.title}
              description={meta.description}
              control={<Skeleton className="h-5 w-9" />}
            />
          ))}
        </TriggerCard>
      </SettingsSection>
    );
  }
  return (
    <div role="status" aria-label="Loading agent settings">
      <div aria-hidden="true">{content}</div>
    </div>
  );
}
