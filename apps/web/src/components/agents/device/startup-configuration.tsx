import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

import { CatalogRowStatic } from "../catalog/catalog-row";
import { ConfigurationList } from "./configuration-page";
import { Blocks } from "lucide-react";

/** Skills that Substrate writes into the agent folder. */
export function StartupSkills({ skills }: { skills: HarnessSkill[] }) {
  return (
    <ConfigurationList label="Substrate skills">
      {skills.map((skill) => (
        <CatalogRowStatic key={skill.id} name={skill.name} detail={skill.description} mono />
      ))}
    </ConfigurationList>
  );
}

/** Substrate's own MCP server, which every agent reaches. */
export function BuiltInServer() {
  return (
    <ConfigurationList label="Built-in server">
      <CatalogRowStatic
        name="substrate"
        detail="Your Substrate workspace"
        picture={<Blocks aria-hidden="true" className="text-muted-foreground" />}
      />
    </ConfigurationList>
  );
}
