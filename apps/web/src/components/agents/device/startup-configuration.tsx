import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

import { Tag } from "@/components/feedback/tag";
import { SettingsList } from "@/components/layout/settings-section";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Blocks } from "lucide-react";

/** Skills that Substrate writes into the agent folder. */
export function StartupSkills({ skills, scanned }: { skills: HarnessSkill[]; scanned: boolean }) {
  return (
    <SettingsList
      title="Substrate skills"
      description={
        scanned
          ? "Read from this agent’s local files. Substrate updates these skills on sync."
          : "Default skill definitions. Open the desktop app to inspect this agent’s local files."
      }
    >
      {skills.map((skill) => (
        <Item key={skill.id} asChild size="xs">
          <li>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">{skill.name}</ItemTitle>
              <ItemDescription>{skill.description}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Tag>{scanned ? "Managed" : "Default"}</Tag>
            </ItemActions>
          </li>
        </Item>
      ))}
    </SettingsList>
  );
}

/** One MCP server: its name and how the agent reaches it. */
export function McpServerRow({
  name,
  detail,
  builtIn,
}: {
  name: string;
  detail?: string;
  builtIn?: boolean;
}) {
  return (
    <Item asChild size="xs">
      <li>
        <ItemMedia variant="icon">
          <Blocks aria-hidden="true" className="text-muted-foreground" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">{name}</ItemTitle>
          {detail && <ItemDescription>{detail}</ItemDescription>}
        </ItemContent>
        {builtIn && (
          <ItemActions>
            <Tag>Built-in</Tag>
          </ItemActions>
        )}
      </li>
    </Item>
  );
}
