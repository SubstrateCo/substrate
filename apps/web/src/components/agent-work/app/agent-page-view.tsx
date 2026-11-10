import type { ReactNode } from "react";

import type { AgentPageSection } from "./agent-sections";
import { SettingsNav, type SettingsNavGroup } from "@/components/agents/layout/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import {
  Activity,
  Blocks,
  CalendarClock,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";

const groups = [
  {
    items: [
      { value: "activity", label: "Activity", icon: Activity },
      { value: "routines", label: "Routines", icon: CalendarClock },
    ],
  },
  {
    label: "Settings",
    items: [
      { value: "general", label: "General", icon: SlidersHorizontal },
      { value: "instructions", label: "Instructions", icon: ScrollText },
      { value: "skills", label: "Skills", icon: Sparkles },
      { value: "mcps", label: "MCP servers", icon: Blocks },
      { value: "run", label: "Run settings", icon: Zap },
    ],
  },
] as const satisfies readonly SettingsNavGroup<AgentPageSection>[];

/** One agent: its name and status, a section list, and the selected section. */
export function AgentPageView({
  name,
  status,
  section,
  onSectionChange,
  children,
}: {
  name: string;
  status?: WorkStatus;
  section: AgentPageSection;
  onSectionChange: (section: AgentPageSection) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="@container grid min-w-0 gap-6 p-6">
        <PageHeader
          title={name}
          description={
            status && (
              <span className={cn(status.tone === "attention" && "text-warning")}>
                {status.label}
              </span>
            )
          }
        />
        <div className="flex min-w-0 flex-col items-stretch gap-6 @3xl:flex-row @3xl:items-start @3xl:gap-10">
          <SettingsNav
            label="Agent sections"
            groups={groups}
            value={section}
            onChange={onSectionChange}
          />
          <div className="@container/content w-full max-w-4xl min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
