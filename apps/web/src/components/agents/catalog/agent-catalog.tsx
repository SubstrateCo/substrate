import type { AgentConfiguration, AgentRunSettings } from "@startup-os/contracts/agents";

import { harnessOptions } from "../harness-meta";
import { CatalogRow } from "./catalog-row";
import { CatalogSection } from "./catalog-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { homeDeviceLabel } from "@/lib/agents/triggers";
import { Bot, Plus } from "lucide-react";

export function AgentCatalog({
  agents = [],
  runSettings = [],
  loading,
  pending,
  onCreate,
  onRunSettings,
  onEdit,
  onDelete,
}: {
  agents?: AgentConfiguration[];
  runSettings?: AgentRunSettings[];
  loading: boolean;
  pending: boolean;
  onCreate: () => void;
  onRunSettings: (agent: AgentConfiguration) => void;
  onEdit: (agent: AgentConfiguration) => void;
  onDelete: (agent: AgentConfiguration) => void;
}) {
  return (
    <CatalogSection
      title="Agents"
      label="Agent actors"
      addLabel="Create agent"
      onAdd={onCreate}
      loading={loading}
      empty={!agents.length}
      emptyState={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              <h4>No agents yet</h4>
            </EmptyTitle>
            <EmptyDescription>
              Create an agent to work in your workspace with its own identity and access.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button disabled={pending} onClick={onCreate}>
              <Plus aria-hidden="true" />
              Create agent
            </Button>
          </EmptyContent>
        </Empty>
      }
    >
      {agents.map((agent) => {
        const settings = runSettings.find((item) => item.agentId === agent.id);
        return (
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
            detail={`${harnessOptions.find((option) => option.value === agent.harness)?.label ?? agent.harness}${agent.useStartupDefaults ? " · Startup OS defaults" : ""}${settings ? ` · Runs on: ${homeDeviceLabel(settings.homeDevice)}` : ""}`}
            disabled={pending}
            onSettings={settings && (() => onRunSettings(agent))}
            onEdit={() => onEdit(agent)}
            onDelete={() => onDelete(agent)}
          />
        );
      })}
    </CatalogSection>
  );
}
