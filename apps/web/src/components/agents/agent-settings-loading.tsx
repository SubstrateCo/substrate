import { agentTriggers } from "@substrate/contracts/agents";

import { CatalogRowLoading } from "@/components/agents/catalog/catalog-row";
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
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
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
        title={section === "skills" ? "Skills" : "MCP servers"}
        description={
          section === "skills"
            ? "How-to guides the agent opens when a task matches. Each skill is a file in its folder on its desktop."
            : "Tool servers this agent can use. Substrate keeps them on its desktop and gives them to the agent at the start of each session."
        }
      >
        <SettingsList title={section === "skills" ? "Your skills" : "Your servers"}>
          <CatalogRowLoading picture={section === "mcps"} />
          <CatalogRowLoading picture={section === "mcps"} />
        </SettingsList>
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
            <TriggerRow key={kind}>
              <FieldContent>
                <FieldLabel>{meta.title}</FieldLabel>
                <FieldDescription>{meta.description}</FieldDescription>
              </FieldContent>
              <Skeleton className="h-5 w-9" />
            </TriggerRow>
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
