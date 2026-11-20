import { CallsLogView } from "../calls/calls-log-view";
import { RoutineRowsLoading } from "../routines/routine-list-view";
import { ActivityRowsLoading } from "./agent-activity-view";
import { AgentPageView } from "./agent-page-view";
import { isAgentSettingsSection, type AgentPageSection } from "./agent-sections";
import { AgentSettingsLoading } from "@/components/agents/agent-settings-loading";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { SettingsContent } from "@/components/layout/settings-page";
import { SettingsSection } from "@/components/layout/settings-section";

export function AgentPageLoading({ section }: { section: AgentPageSection }) {
  let content;
  if (isAgentSettingsSection(section)) {
    content = (
      <SettingsContent>
        <AgentSettingsLoading section={section} />
      </SettingsContent>
    );
  } else if (section === "calls") {
    content = <CallsLogView entries={[]} loading error={null} onRetry={() => {}} />;
  } else if (section === "routines") {
    content = (
      <SettingsSection
        title="Routines"
        description="Work this agent starts on a schedule. Each new or changed routine waits for your approval."
      >
        <RoutineRowsLoading />
      </SettingsSection>
    );
  } else {
    content = (
      <SettingsSection
        title="Activity"
        description="Everything this agent worked on, newest first. Open a row to see its transcript."
      >
        <ActivityRowsLoading />
      </SettingsSection>
    );
  }
  return (
    <AgentPageView
      name={<SkeletonText width="12rem" />}
      section={section}
      loading
      onSectionChange={() => {}}
    >
      {content}
    </AgentPageView>
  );
}
