import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

import { recordRows } from "@/components/layout/record-section";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Blocks } from "lucide-react";

/** Skills that Substrate writes into the agent folder. */
export function StartupSkills({ skills }: { skills: HarnessSkill[] }) {
  return (
    <ul aria-label="Substrate skills" className={recordRows}>
      {skills.map((skill) => (
        <Item key={skill.id} asChild size="xs">
          <li>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">
                <code>{skill.name}</code>
              </ItemTitle>
              <ItemDescription>{skill.description}</ItemDescription>
            </ItemContent>
          </li>
        </Item>
      ))}
    </ul>
  );
}

/** One MCP server: its name and how the agent reaches it. */
export function McpServerRow({ name, detail }: { name: string; detail?: string }) {
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
      </li>
    </Item>
  );
}
