import { AgentSettings } from "@/components/agents/agent-settings";
import { SettingsNav, type SettingsNavGroup } from "@/components/agents/layout/settings-nav";
import { useDraftKeys } from "@/components/feedback/unsaved-drafts";
import { SettingsContent } from "@/components/layout/settings-page";
import { isAgentSettingsSection, type AgentSettingsSection } from "@/lib/agent-work/agent-sections";
import { Blocks, ScrollText, SlidersHorizontal, Sparkles, Zap } from "lucide-react";

const groups = [
  {
    id: "settings",
    items: [
      { value: "general", label: "General", icon: SlidersHorizontal },
      { value: "instructions", label: "Instructions", icon: ScrollText },
      { value: "skills", label: "Skills", icon: Sparkles },
      { value: "mcps", label: "MCP servers", icon: Blocks },
      { value: "run", label: "Run settings", icon: Zap },
    ],
  },
] as const satisfies readonly SettingsNavGroup<AgentSettingsSection>[];

export function AgentSettingsPanel({
  userId,
  organizationId,
  agentId,
  section,
  onSectionChange,
  onDeleted,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  section: AgentSettingsSection;
  onSectionChange: (section: AgentSettingsSection) => void;
  onDeleted: () => void;
}) {
  const unsaved = useDraftKeys().filter(isAgentSettingsSection);
  return (
    <div className="@container">
      <div className="flex min-w-0 flex-col gap-6 @3xl:flex-row @3xl:items-start @3xl:gap-10">
        <SettingsNav
          label="Agent sections"
          groups={groups}
          value={section}
          marked={unsaved}
          onChange={onSectionChange}
        />
        <SettingsContent>
          <AgentSettings
            userId={userId}
            organizationId={organizationId}
            agentId={agentId}
            section={section}
            onSectionChange={onSectionChange}
            onClose={onDeleted}
          />
        </SettingsContent>
      </div>
    </div>
  );
}
