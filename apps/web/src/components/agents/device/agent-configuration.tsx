import {
  startupSkillIds,
  startupSkills,
  type HarnessKind,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import { useRef, useState, type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { SkillEditor } from "../editors/skill-editor";
import { openingName } from "../editors/skill-name";
import { McpServerRow, StartupSkills } from "./startup-configuration";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { SettingsList, SettingsNote, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { useAgentConfigurationMutations } from "@/queries/agents/configuration-mutations";
import {
  localAgentConfiguration,
  localConfigurationOptions,
} from "@/queries/agents/local-configuration";
import { Info, Laptop, Plus, RefreshCw, RotateCcw } from "lucide-react";
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
  harness,
  refresh,
  status,
}: {
  servers: readonly HarnessMcpServer[];
  scanned: boolean;
  defaults: boolean;
  available: boolean;
  harness: HarnessKind;
  refresh: ReactNode;
  status: ReactNode;
}) {
  return (
    <SettingsSection
      title="MCP servers"
      description="Tool servers this agent can use, read from its configuration on its desktop."
      actions={refresh}
    >
      {status}
      {(defaults || scanned) && (
        <SettingsList
          description={
            defaults
              ? "Substrate adds the built-in server, which lets the agent read and post in this workspace."
              : undefined
          }
        >
          {defaults && <McpServerRow name="substrate" detail="Substrate workspace" builtIn />}
          {servers.map((server) => (
            <McpServerRow key={server.id} name={server.name} detail={serverDetail(server)} />
          ))}
          {scanned && !servers.length && !defaults && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No MCP servers.</li>
          )}
        </SettingsList>
      )}
      {available && (
        <SettingsNote icon={<Info />}>
          Substrate lists these servers but can’t add or edit them yet. Change them in{" "}
          {harnessLabel(harness)}’s own configuration for this agent, then read the files again.
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
      {available && pending && <LoadingState label="Reading the agent’s files" variant="compact" />}
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
  const { save, remove, reset } = useAgentConfigurationMutations(local);
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
        harness={harness}
        refresh={refresh}
        status={status}
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
