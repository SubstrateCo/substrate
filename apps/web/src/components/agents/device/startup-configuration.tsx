import type { HarnessSkill } from "@substrate/contracts/harness-runtime";

import { CatalogRowStatic } from "../catalog/catalog-row";
import { ConfigurationList } from "./configuration-page";
import { Blocks } from "lucide-react";

export function StartupSkills({ skills }: { skills: HarnessSkill[] }) {
  return (
    <ConfigurationList label="Substrate skills">
      {skills.map((skill) => (
        <CatalogRowStatic key={skill.id} name={skill.name} detail={skill.description} mono />
      ))}
    </ConfigurationList>
  );
}

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
