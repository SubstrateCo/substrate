import {
  maxHarnessMcpServers,
  startupSkillIds,
  startupSkills,
  type HarnessKind,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import { useRef, useState, type ReactNode } from "react";

import { CatalogRow, CatalogRowLoading } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { McpServerEditor } from "../editors/mcp-server-editor";
import { SkillEditor } from "../editors/skill-editor";
import { openingName } from "../editors/skill-name";
import { McpServerRow, StartupSkills } from "./startup-configuration";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { SettingsList, SettingsNote, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mcpServerLimitReached } from "@/lib/agents/mcp-server-draft";
import { useAgentConfigurationMutations } from "@/queries/agents/configuration-mutations";
import {
  localAgentConfiguration,
  localConfigurationOptions,
} from "@/queries/agents/local-configuration";
import { Blocks, Info, Laptop, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/** How the agent reaches a server: the command it runs or the host it calls. */
function serverDetail(server: HarnessMcpServer) {
  if (server.transport === "stdio") return `Runs ${server.command}`;
  return `Connects to ${new URL(server.url).host}`;
}

function skillLists(scannedSkills: HarnessSkill[] | undefined, showDefaults: boolean) {
  if (!scannedSkills) return { skills: [], managedSkills: showDefaults ? startupSkills : [] };
  // Substrate rewrites its own skills on every sync, so they are not listed as editable.
  const isStartupSkill = (skill: HarnessSkill) => startupSkillIds.includes(skill.id);
  return {
    skills: scannedSkills.filter((skill) => !isStartupSkill(skill)),
    managedSkills: scannedSkills.filter(isStartupSkill),
  };
}

function McpServersSection({
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
      title="MCP servers"
      description="Tool servers this agent can use. Substrate keeps them on its desktop and gives them to the agent at the start of each session."
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
        <SettingsList title="Your servers">
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

function ConfigurationStatus({
  available,
  agentId,
  section,
  pending,
  error,
  onRetry,
}: {
  available: boolean;
  agentId?: string;
  section: AgentSection;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <>
      {!available && (
        <SettingsNote icon={<Laptop />}>
          {agentId
            ? `Open this agent in the Substrate desktop app to see the ${section === "skills" ? "skills" : "MCP servers"} in its folder.`
            : "Save this agent to see its local configuration."}
        </SettingsNote>
      )}
      {available && pending && (
        <div role="status" aria-label="Reading the agent’s files">
          <div aria-hidden="true">
            <SettingsList title={section === "skills" ? "Your skills" : "Your servers"}>
              <CatalogRowLoading picture={section === "mcps"} />
              <CatalogRowLoading picture={section === "mcps"} />
            </SettingsList>
          </div>
        </div>
      )}
      {error && <ErrorState compact title="Couldn’t read this agent’s files" onRetry={onRetry} />}
    </>
  );
}

function SkillList({
  skills,
  removing,
  onEdit,
  onDelete,
}: {
  skills: readonly HarnessSkill[];
  removing: boolean;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
}) {
  return (
    <SettingsList title="Your skills">
      {skills.length ? (
        skills.map((item) => {
          // The list, the editor and the delete prompt all name the skill by its file name.
          const name = openingName(item);
          return (
            <CatalogRow
              key={item.id}
              name={name}
              mono
              detail={item.description}
              disabled={removing}
              onEdit={() => onEdit(item.id)}
              onDelete={() => onDelete({ id: item.id, name })}
            />
          );
        })
      ) : (
        <li className="px-4 py-3 text-sm text-muted-foreground">
          No skills of your own yet. Create one to teach this agent a repeatable task.
        </li>
      )}
    </SettingsList>
  );
}

export function AgentConfiguration({
  userId,
  organizationId,
  agentId,
  harness,
  section,
  defaults,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  harness: HarnessKind;
  section: AgentSection;
  defaults: boolean;
}) {
  const local = localAgentConfiguration(userId, organizationId, agentId, harness);
  const available = !!local;
  const [editing, setEditing] = useState<{ id?: string }>();
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const container = useRef<HTMLDivElement>(null);
  const { remember: rememberLauncher, restore: restoreFocus } = useFocusReturn(container);
  const configuration = useQuery(localConfigurationOptions(userId, local));
  const { save, remove, reset, saveServer, removeServer } = useAgentConfigurationMutations(local);
  const [editingServer, setEditingServer] = useState<{ server?: HarnessMcpServer }>();
  const [deletingServer, setDeletingServer] = useState<HarnessMcpServer>();
  const [resetting, setResetting] = useState(false);
  const { skills, managedSkills } = skillLists(configuration.data?.skills, !available && defaults);
  const servers = configuration.data?.mcpServers ?? [];
  const skill = skills.find((item) => item.id === editing?.id);
  const refresh = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Read the agent’s files again"
          disabled={!available || configuration.isFetching}
          onClick={() => void configuration.refetch()}
        >
          <RefreshCw className={configuration.isFetching ? "motion-safe:animate-spin" : ""} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Read the agent’s files again</TooltipContent>
    </Tooltip>
  );
  const status = (
    <ConfigurationStatus
      available={available}
      agentId={agentId}
      section={section}
      pending={configuration.isPending}
      error={configuration.error}
      onRetry={() => void configuration.refetch()}
    />
  );
  const content =
    section === "skills" ? (
      <SettingsSection
        title="Skills"
        description="How-to guides the agent opens when a task matches. Each skill is a file in its folder on its desktop."
        actions={
          <>
            {refresh}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!available || reset.isPending}
              onClick={() => {
                rememberLauncher();
                setResetting(true);
              }}
            >
              <RotateCcw />
              Reset defaults
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!available || configuration.isFetching}
              onClick={() => {
                rememberLauncher();
                setEditing({});
              }}
            >
              <Plus />
              New skill
            </Button>
          </>
        }
      >
        {status}
        {managedSkills.length > 0 && (
          <StartupSkills skills={managedSkills} scanned={!!configuration.data} />
        )}
        {configuration.data && (
          <SkillList
            skills={skills}
            removing={remove.isPending}
            onEdit={(id) => {
              rememberLauncher();
              setEditing({ id });
            }}
            onDelete={(skill) => {
              rememberLauncher();
              setDeleting(skill);
            }}
          />
        )}
      </SettingsSection>
    ) : (
      <McpServersSection
        servers={servers}
        scanned={!!configuration.data}
        defaults={defaults}
        available={available}
        refresh={refresh}
        status={status}
        busy={saveServer.isPending || removeServer.isPending}
        onCreate={() => {
          rememberLauncher();
          setEditingServer({});
        }}
        onEdit={(server) => {
          rememberLauncher();
          setEditingServer({ server });
        }}
        onDelete={(server) => {
          rememberLauncher();
          setDeletingServer(server);
        }}
      />
    );
  return (
    <div ref={container} tabIndex={-1}>
      {content}
      {editing && (
        <SkillEditor
          skill={skill}
          pending={save.isPending}
          error={save.error}
          onRestoreFocus={restoreFocus}
          onClose={() => {
            setEditing(undefined);
            save.reset();
          }}
          onSave={(input) =>
            save.mutate(input, {
              onSuccess: () => {
                toast.success("Skill saved.");
                setEditing(undefined);
              },
            })
          }
        />
      )}
      {editingServer && (
        <McpServerEditor
          server={editingServer.server}
          servers={servers}
          pending={saveServer.isPending}
          error={saveServer.error}
          onRestoreFocus={restoreFocus}
          onClose={() => {
            setEditingServer(undefined);
            saveServer.reset();
          }}
          onSave={(server) =>
            saveServer.mutate(server, {
              onSuccess: () => {
                toast.success(editingServer.server ? "Server saved." : "Server added.");
                setEditingServer(undefined);
              },
            })
          }
        />
      )}
      {deletingServer && (
        <ConfirmDialog
          title={`Delete ${deletingServer.name}?`}
          description="This removes the server from this agent on this desktop. New sessions won’t use it. You can’t undo this."
          confirmLabel="Delete server"
          pendingLabel="Deleting."
          errorDescription="We couldn’t delete this server. Try again."
          destructive
          pending={removeServer.isPending}
          error={removeServer.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            removeServer.mutate(deletingServer.id, {
              onSuccess: () => {
                toast.success("Server deleted.");
                setDeletingServer(undefined);
              },
            })
          }
          onClose={() => {
            setDeletingServer(undefined);
            removeServer.reset();
          }}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Reset Substrate defaults?"
          description="This replaces the agent’s instructions file and Substrate skills on this device with the saved agent settings. Local edits to those files are lost. Your other skills and MCP servers are not changed."
          confirmLabel="Reset defaults"
          pendingLabel="Resetting…"
          errorDescription="We couldn’t reset the defaults. Try again."
          destructive
          pending={reset.isPending}
          error={reset.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                toast.success("Substrate defaults reset.");
                setResetting(false);
              },
            })
          }
          onClose={() => {
            setResetting(false);
            reset.reset();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="This deletes the skill’s file from this agent’s folder on this desktop. New sessions won’t use it. You can’t undo this."
          confirmLabel="Delete skill"
          pendingLabel="Deleting…"
          errorDescription="We couldn’t delete this skill. Try again."
          destructive
          pending={remove.isPending}
          error={remove.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success("Skill deleted.");
                setDeleting(undefined);
              },
            })
          }
          onClose={() => {
            setDeleting(undefined);
            remove.reset();
          }}
        />
      )}
    </div>
  );
}
