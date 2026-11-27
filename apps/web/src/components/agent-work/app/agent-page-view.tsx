import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { WorkOrb } from "../work-orb";
import { toneText } from "@/components/feedback/tag-styles";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  agentConversationSections,
  isAgentSettingsSection,
  type AgentConversationSection,
  type AgentPageSection,
} from "@/lib/agent-work/agent-sections";
import type { AgentHeaderStatus } from "@/lib/agent-work/status";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { Bot, CircleAlert, MonitorOff } from "lucide-react";

const labels: Record<AgentConversationSection, string> = {
  messages: "Messages",
  activity: "Activity",
  routines: "Routines",
};

function HeaderStatusIcon({ status }: { status: AgentHeaderStatus }) {
  if (status.orb) return <WorkOrb state={status.orb} />;
  if (status.tone === "attention")
    return <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />;
  // No desktop, or the desktop is offline.
  return <MonitorOff aria-hidden="true" className="size-3.5 shrink-0" />;
}

/** What the agent does as a whole. Idle shows nothing; the activity stays in the timeline. */
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
  status,
  elsewhere,
  section,
  onSectionChange,
  messages,
  activity,
  routines,
  settings,
}: {
  name: ReactNode;
  status?: AgentHeaderStatus | null;
  /** The conversation where the agent works now, when it is not this page's conversation. */
  elsewhere?: { link: RecordLink; label: string };
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
        actions={status && <HeaderStatus status={status} elsewhere={elsewhere} />}
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
