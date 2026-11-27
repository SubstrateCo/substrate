import type { ReactNode } from "react";

import { recordRows } from "@/components/layout/record-section";
import { SettingsSection } from "@/components/layout/settings-section";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { cn } from "cn";
import { ArrowRight, Blocks, Sparkles, type LucideIcon } from "lucide-react";

export type ToolSummary = {
  /** What it holds, such as "release-notes, changelog · plus Substrate skills". */
  detail: string;
  /** Unknown away from the agent's home desktop. */
  count?: number;
};

function ToolRow({
  icon: Icon,
  title,
  summary,
  extra,
  onOpen,
}: {
  icon: LucideIcon;
  title: string;
  summary: ToolSummary;
  extra?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <Item asChild size="xs">
        <button type="button" className="text-left hover:bg-row-hover" onClick={onOpen}>
          <ItemMedia variant="icon">
            <Icon aria-hidden="true" className="text-muted-foreground" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <ItemTitle>{title}</ItemTitle>
              <div className="ml-auto flex items-center gap-2">
                {extra}
                {summary.count !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {summary.count}
                  </span>
                )}
                <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </div>
            </div>
            {summary.detail && <ItemDescription>{summary.detail}</ItemDescription>}
          </ItemContent>
        </button>
      </Item>
    </li>
  );
}

/**
 * Skills and MCP servers in the settings overview: one row each, whatever the agent has. Each
 * opens its full list in the sheet.
 */
export function ToolsSummaryView({
  skills,
  servers,
  onOpen,
}: {
  skills: ToolSummary;
  servers: ToolSummary;
  onOpen: (page: "skills" | "mcps") => void;
}) {
  return (
    <SettingsSection title="Tools">
      <ul aria-label="Tools" className={cn(recordRows, "min-w-0 gap-4 @md:grid-cols-2")}>
        <ToolRow icon={Sparkles} title="Skills" summary={skills} onOpen={() => onOpen("skills")} />
        <ToolRow
          icon={Blocks}
          title="MCP servers"
          summary={servers}
          // Future: servers that can't connect, once the agent host reports their health.
          // extra={failing > 0 && <Tag tone="destructive">{failing} can't connect</Tag>}
          onOpen={() => onOpen("mcps")}
        />
      </ul>
    </SettingsSection>
  );
}
