import { maxHarnessMcpServers, type HarnessMcpServer } from "@substrate/contracts/harness-runtime";

import { useState, type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import {
  BuiltInGroup,
  ConfigurationList,
  ConfigurationPage,
  ConfigurationSearch,
} from "./configuration-page";
import { configurationSections, matchesSearch } from "./configuration-section-copy";
import { BuiltInServer } from "./startup-configuration";
import { SettingsNote } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { mcpServerLimitReached } from "@/lib/agents/mcp-server-draft";
import { Globe, Info, Plus, SquareTerminal } from "lucide-react";

function serverDetail(server: HarnessMcpServer) {
  if (server.transport === "stdio") return [server.command, ...(server.args ?? [])].join(" ");
  const url = new URL(server.url);
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
}

function ServerDetail({ server }: { server: HarnessMcpServer }) {
  return (
    <>
      {server.transport === "stdio" ? "Local" : "Remote"} ·{" "}
      <code className="text-xs">{serverDetail(server)}</code>
    </>
  );
}

function ServerIcon({ server }: { server: HarnessMcpServer }) {
  const Icon = server.transport === "stdio" ? SquareTerminal : Globe;
  return <Icon aria-hidden="true" className="text-muted-foreground" />;
}

export function McpServersSection({
  servers,
  scanned,
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
  available: boolean;
  refresh: ReactNode;
  status: ReactNode;
  busy: boolean;
  onCreate: () => void;
  onEdit: (server: HarnessMcpServer) => void;
  onDelete: (server: HarnessMcpServer) => void;
}) {
  const [query, setQuery] = useState("");
  const full = mcpServerLimitReached(servers);
  const shown = servers.filter((server) => matchesSearch(query, server.name, serverDetail(server)));
  let empty = "No servers yet. Add one to give the agent more tools.";
  if (query.trim()) empty = "No servers match.";
  const copy = configurationSections.mcps;
  return (
    <ConfigurationPage
      toolbar={
        <>
          {scanned && servers.length > 0 && (
            <ConfigurationSearch
              label="servers"
              count={servers.length}
              value={query}
              onChange={setQuery}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
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
          </div>
        </>
      }
    >
      {status}
      {scanned && (
        <ConfigurationList title={copy.listTitle} description={copy.description}>
          {shown.length ? (
            shown.map((server) => (
              <CatalogRow
                key={server.id}
                name={server.name}
                detail={<ServerDetail server={server} />}
                picture={<ServerIcon server={server} />}
                disabled={busy}
                onEdit={() => onEdit(server)}
                onDelete={() => onDelete(server)}
              />
            ))
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">{empty}</li>
          )}
        </ConfigurationList>
      )}
      {full && (
        <SettingsNote icon={<Info />}>
          This agent has {maxHarnessMcpServers} servers, the most it can have. Delete one to add
          another.
        </SettingsNote>
      )}
      <BuiltInGroup
        title="Built-in server"
        description="Substrate connects every session to your workspace. It can't be removed."
        count={1}
        noun="server"
      >
        <BuiltInServer />
      </BuiltInGroup>
    </ConfigurationPage>
  );
}
