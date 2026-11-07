import type { AgentConfiguration } from "@startup-os/contracts/agents";

import { CatalogSection } from "../catalog-section";
import { CatalogRow } from "../catalog-section/catalog-row";
import { harnessOptions } from "../harness-meta";
import { PicturePreview } from "@/ui/upload/picture-preview";

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
      description="Choose a harness and instructions for your agent actor."
      addLabel="Create agent"
      onAdd={onCreate}
      empty={!agents.length}
    >
      {agents.map((agent) => (
        <CatalogRow
          key={agent.id}
          name={agent.name}
          picture={
            <PicturePreview
              src={agent.image}
              alt={`${agent.name} profile picture`}
              className="size-10 shrink-0 rounded-full object-cover"
              fallback={
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm"
                  aria-hidden="true"
                >
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
              }
            />
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
