import { maxHarnessMcpServers, type HarnessMcpServer } from "@substrate/contracts/harness";

import { type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { configurationSections } from "./configuration-sections";
import { McpServerRow } from "./startup-configuration";
import { SettingsList, SettingsNote, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { mcpServerLimitReached } from "@/lib/agents/mcp-server-draft";
import { Blocks, Info, Plus } from "lucide-react";

/** How the agent reaches a server: the command it runs or the host it calls. */
function serverDetail(server: HarnessMcpServer) {
  if (server.transport === "stdio") return `Runs ${server.command}`;
  return `Connects to ${new URL(server.url).host}`;
}

export function McpServersSection({
  servers,
  scanned,
  defaults,
  available,
  refresh,
  status,
  busy,
  onCreate,
  onEdit,
  onDelete,
}: {
  servers: readonly HarnessMcpServer[];
  scanned: boolean;
  defaults: boolean;
  available: boolean;
  refresh: ReactNode;
  status: ReactNode;
  /** A save or delete is running. */
  busy: boolean;
  onCreate: () => void;
  onEdit: (server: HarnessMcpServer) => void;
  onDelete: (server: HarnessMcpServer) => void;
}) {
  const full = mcpServerLimitReached(servers);
  return (
    <SettingsSection
      title={configurationSections.mcps.title}
      description={configurationSections.mcps.description}
      actions={
        <>
          {refresh}
          <Button
            type="button"
            size="sm"
            disabled={!available || !scanned || full || busy}
            onClick={onCreate}
          >
            <Plus />
            New server
          </Button>
        </>
      }
    >
      {status}
      {defaults && (
        <SettingsList description="Substrate adds the built-in server, which lets the agent read and post in this workspace.">
          <McpServerRow name="substrate" detail="Substrate workspace" builtIn />
        </SettingsList>
      )}
      {scanned && (
        <SettingsList title={configurationSections.mcps.listTitle}>
          {servers.length ? (
            servers.map((server) => (
              <CatalogRow
                key={server.id}
                name={server.name}
                detail={serverDetail(server)}
                picture={
                  <Blocks aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                }
                disabled={busy}
                onEdit={() => onEdit(server)}
                onDelete={() => onDelete(server)}
              />
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No servers of your own yet. Add one to give this agent more tools.
            </li>
          )}
        </SettingsList>
      )}
      {full && (
        <SettingsNote icon={<Info />}>
          This agent has {maxHarnessMcpServers} servers, the most it can have. Delete one to add
          another.
        </SettingsNote>
      )}
    </SettingsSection>
  );
}
