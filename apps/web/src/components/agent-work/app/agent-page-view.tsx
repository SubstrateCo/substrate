import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  agentConversationSections,
  isAgentSettingsSection,
  type AgentConversationSection,
  type AgentPageSection,
} from "@/lib/agent-work/agent-sections";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Bot } from "lucide-react";

const labels: Record<AgentConversationSection, string> = {
  messages: "Messages",
  activity: "Activity",
  routines: "Routines",
};

export function AgentPageView({
  name,
  status,
  section,
  onSectionChange,
  messages,
  activity,
  routines,
  settings,
}: {
  name: ReactNode;
  status?: WorkStatus;
  section: AgentPageSection;
  onSectionChange: (section: AgentPageSection) => void;
  messages: ReactNode;
  activity: ReactNode;
  routines: ReactNode;
  settings: ReactNode;
}) {
  const tab = isAgentSettingsSection(section) ? "settings" : section;
  return (
    <section aria-label="Agent" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <PageHeader
        variant="pane"
        title={name}
        icon={<Bot aria-hidden="true" />}
        actions={
          status && (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                status.tone === "attention" && "text-warning-text",
              )}
            >
              {status.label}
            </span>
          )
        }
      />
      <Tabs
        value={tab}
        activationMode="manual"
        onValueChange={(value) => {
          if (value === "settings") return onSectionChange("general");
          const next = agentConversationSections.find((item) => item === value);
          if (next) onSectionChange(next);
        }}
        className="min-h-0 flex-1"
      >
        <div className="shrink-0 overflow-x-auto border-b px-4 pb-1">
          <TabsList variant="line" aria-label="Agent views">
            {agentConversationSections.map((item) => (
              <TabsTrigger key={item} value={item}>
                {labels[item]}
              </TabsTrigger>
            ))}
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="messages" className="flex min-h-0 flex-1 flex-col">
          {messages}
        </TabsContent>
        <AgentSectionPanel value="activity">{activity}</AgentSectionPanel>
        <AgentSectionPanel value="routines">{routines}</AgentSectionPanel>
        <AgentSectionPanel value="settings">{settings}</AgentSectionPanel>
      </Tabs>
    </section>
  );
}

function AgentSectionPanel({
  value,
  children,
}: {
  value: Exclude<AgentConversationSection, "messages"> | "settings";
  children: ReactNode;
}) {
  return (
    <TabsContent value={value} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </div>
    </TabsContent>
  );
}
