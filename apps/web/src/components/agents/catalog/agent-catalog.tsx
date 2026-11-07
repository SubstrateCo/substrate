import type { AgentConfiguration } from "@startup-os/contracts/agents";

import { harnessOptions } from "../harness-meta";
import { CatalogRow } from "./catalog-row";
import { CatalogSection } from "./catalog-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AgentCatalog({
  agents,
  pending,
  onCreate,
  onEdit,
  onDelete,
}: {
  agents: AgentConfiguration[];
  pending: boolean;
  onCreate: () => void;
  onEdit: (agent: AgentConfiguration) => void;
  onDelete: (agent: AgentConfiguration) => void;
}) {
  return (
    <CatalogSection
      title="Agents"
      label="Agent actors"
      addLabel="Create agent"
      onAdd={onCreate}
      empty={!agents.length}
    >
      {agents.map((agent) => (
        <CatalogRow
          key={agent.id}
          name={agent.name}
          picture={
            <Avatar size="lg" variant="catalog">
              <AvatarImage src={agent.image ?? undefined} alt={`${agent.name} profile picture`} />
              <AvatarFallback aria-hidden="true">
                {agent.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          }
          detail={`${harnessOptions.find((option) => option.value === agent.harness)?.label ?? agent.harness} · ${agent.enabled ? "Enabled" : "Disabled"}${agent.useStartupDefaults ? " · Startup OS defaults" : ""}`}
          disabled={pending}
          onEdit={() => onEdit(agent)}
          onDelete={() => onDelete(agent)}
        />
      ))}
    </CatalogSection>
  );
}
