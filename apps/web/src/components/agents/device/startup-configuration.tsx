import type { HarnessSkill } from "@substrate/contracts/harness";

import { SettingsList } from "@/components/layout/settings-section";
import { Blocks } from "lucide-react";

function Tag({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

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
        <li key={skill.id} className="grid gap-1 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{skill.name}</p>
            <Tag>{scanned ? "Managed" : "Default"}</Tag>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
        </li>
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
    <li className="flex min-w-0 items-center gap-3 px-4 py-3">
      <Blocks aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-sm font-medium wrap-anywhere">{name}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
      {builtIn && <Tag>Built-in</Tag>}
    </li>
  );
}
