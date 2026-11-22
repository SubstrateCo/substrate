import type { ReactNode } from "react";

import {
  agentConversationSections,
  isAgentSettingsSection,
  type AgentConversationSection,
  type AgentPageSection,
} from "./agent-sections";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Bot } from "lucide-react";

const labels: Record<AgentConversationSection, string> = {
  messages: "Messages",
  activity: "Activity",
  routines: "Routines",
  calls: "Calls",
};

export function AgentPageView({
  name,
  status,
  section,
  onSectionChange,
  children,
  loading = false,
}: {
  name: ReactNode;
  status?: WorkStatus;
  section: AgentPageSection;
  onSectionChange: (section: AgentPageSection) => void;
  children: ReactNode;
  loading?: boolean;
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
              <TabsTrigger key={item} value={item} disabled={loading}>
                {labels[item]}
              </TabsTrigger>
            ))}
            <TabsTrigger value="settings" disabled={loading}>
              Settings
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value={tab} className="flex min-h-0 flex-1 flex-col">
          {section === "messages" ? (
            children
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
