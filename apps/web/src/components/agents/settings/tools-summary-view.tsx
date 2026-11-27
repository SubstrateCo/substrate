import { useId, type ReactNode } from "react";

import { GroupTitle, SettingsList } from "@/components/layout/settings-section";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
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
            <ItemTitle>{title}</ItemTitle>
            <ItemDescription>{summary.detail}</ItemDescription>
          </ItemContent>
          {extra}
          {summary.count !== undefined && (
            <span className="text-xs text-muted-foreground tabular-nums">{summary.count}</span>
          )}
          <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
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
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-3">
      <GroupTitle id={`${id}-title`} title="Tools" />
      <SettingsList label="Tools">
        <ToolRow icon={Sparkles} title="Skills" summary={skills} onOpen={() => onOpen("skills")} />
        <ToolRow
          icon={Blocks}
          title="MCP servers"
          summary={servers}
          // Future: servers that can't connect, once the agent host reports their health.
          // extra={failing > 0 && <Tag tone="destructive">{failing} can't connect</Tag>}
          onOpen={() => onOpen("mcps")}
        />
      </SettingsList>
    </section>
  );
}
