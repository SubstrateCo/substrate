import { startupSkillIds, startupSkills } from "@substrate/contracts/agent-tools";
import {
  type HarnessKind,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness-runtime";

import { useQuery } from "@tanstack/react-query";

import { useRef } from "react";

import type { AgentSection } from "../editors/agent-form";
import { McpServerEditor } from "../editors/mcp-server-editor";
import { SkillEditor } from "../editors/skill-editor";
import { ConfigurationStatus } from "./configuration-status";
import { McpServersSection } from "./mcp-servers-section";
import { SkillsSection } from "./skills-section";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAgentConfigurationMutations } from "@/queries/agents/configuration-mutations";
import {
  localAgentConfiguration,
  localConfigurationOptions,
} from "@/queries/agents/local-configuration";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

function skillLists(scannedSkills: HarnessSkill[] | undefined, showDefaults: boolean) {
  if (!scannedSkills) return { skills: [], managedSkills: showDefaults ? startupSkills : [] };
  // Substrate rewrites its own skills on every sync, so they are not listed as editable.
  const isStartupSkill = (skill: HarnessSkill) => startupSkillIds.includes(skill.id);
  return {
    skills: scannedSkills.filter((skill) => !isStartupSkill(skill)),
    managedSkills: scannedSkills.filter(isStartupSkill),
  };
}

function RefreshConfiguration({
  disabled,
  fetching,
  onRefresh,
}: {
  disabled: boolean;
  fetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Read the agent’s files again"
          disabled={disabled}
          onClick={onRefresh}
        >
          <RefreshCw className={fetching ? "motion-safe:animate-spin" : ""} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Read the agent’s files again</TooltipContent>
    </Tooltip>
  );
}

type ConfigurationDialog =
  | { kind: "editSkill"; id?: string }
  | { kind: "deleteSkill"; skill: { id: string; name: string } }
  /** The server being edited, or none for a new one. */
  | { kind: "editServer"; server?: HarnessMcpServer }
  | { kind: "deleteServer"; server: HarnessMcpServer }
  | { kind: "reset" };

export function AgentConfiguration({
  agentId,
  harness,
  section,
  defaults,
  homeDevice,
}: {
  agentId?: string;
  harness: HarnessKind;
  section: AgentSection;
  defaults: boolean;
  /** The agent's home desktop. Its skills and MCP servers are edited only there. */
  homeDevice: { name: string; current: boolean } | null;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const local = localAgentConfiguration(
    userId,
    organizationId,
    agentId,
    harness,
    !!homeDevice?.current,
  );
  const available = !!local;
  const container = useRef<HTMLDivElement>(null);
  const {
    value: dialog,
    open,
    close,
    restoreFocus,
  } = useStateDialog<ConfigurationDialog>(container);
  const configuration = useQuery(localConfigurationOptions(userId, local));
  const { save, remove, reset, saveServer, removeServer } = useAgentConfigurationMutations(local);
  const { skills, managedSkills } = skillLists(configuration.data?.skills, !available && defaults);
  const servers = configuration.data?.mcpServers ?? [];
  const skill =
    dialog?.kind === "editSkill" ? skills.find((item) => item.id === dialog.id) : undefined;
  const refresh = (
    <RefreshConfiguration
      disabled={!available || configuration.isFetching}
      fetching={configuration.isFetching}
      onRefresh={() => void configuration.refetch()}
    />
  );
  const status = (
    <ConfigurationStatus
      available={available}
      agentId={agentId}
      homeDeviceName={homeDevice?.name}
      section={section}
      pending={configuration.isPending}
      error={configuration.error}
      onRetry={() => void configuration.refetch()}
    />
  );
  const content =
    section === "skills" ? (
      <SkillsSection
        skills={skills}
        managedSkills={managedSkills}
        scanned={!!configuration.data}
        available={available}
        fetching={configuration.isFetching}
        refresh={refresh}
        status={status}
        resetting={reset.isPending}
        removing={remove.isPending}
        onReset={() => open({ kind: "reset" })}
        onCreate={() => open({ kind: "editSkill" })}
        onEdit={(id) => open({ kind: "editSkill", id })}
        onDelete={(skill) => open({ kind: "deleteSkill", skill })}
      />
    ) : (
      <McpServersSection
        servers={servers}
        scanned={!!configuration.data}
        defaults={defaults}
        available={available}
        refresh={refresh}
        status={status}
        busy={saveServer.isPending || removeServer.isPending}
        onCreate={() => open({ kind: "editServer" })}
        onEdit={(server) => open({ kind: "editServer", server })}
        onDelete={(server) => open({ kind: "deleteServer", server })}
      />
    );
  return (
    <div ref={container} tabIndex={-1}>
      {content}
      <ConfigurationDialogs
        dialog={dialog}
        skill={skill}
        servers={servers}
        mutations={{ save, remove, reset, saveServer, removeServer }}
        close={close}
        restoreFocus={restoreFocus}
      />
    </div>
  );
}

/** The open editor or confirmation, if any. Each closes itself once its change is saved. */
function ConfigurationDialogs({
  dialog,
  skill,
  servers,
  mutations: { save, remove, reset, saveServer, removeServer },
  close,
  restoreFocus,
}: {
  dialog: ConfigurationDialog | undefined;
  /** The skill being edited, or none for a new one. */
  skill: HarnessSkill | undefined;
  servers: HarnessMcpServer[];
  mutations: Pick<
    ReturnType<typeof useAgentConfigurationMutations>,
    "save" | "remove" | "reset" | "saveServer" | "removeServer"
  >;
  close: () => void;
  restoreFocus: () => void;
}) {
  switch (dialog?.kind) {
    case "editSkill":
      return (
        <SkillEditor
          skill={skill}
          pending={save.isPending}
          error={save.error}
          onRestoreFocus={restoreFocus}
          onClose={() => {
            close();
            save.reset();
          }}
          onSave={(input) =>
            save.mutate(input, {
              onSuccess: () => {
                toast.success("Skill saved.");
                close();
              },
            })
          }
        />
      );
    case "editServer":
      return (
        <McpServerEditor
          server={dialog.server}
          servers={servers}
          pending={saveServer.isPending}
          error={saveServer.error}
          onRestoreFocus={restoreFocus}
          onClose={() => {
            close();
            saveServer.reset();
          }}
          onSave={(server) =>
            saveServer.mutate(server, {
              onSuccess: () => {
                toast.success(dialog.server ? "Server saved." : "Server added.");
                close();
              },
            })
          }
        />
      );
    case "deleteServer":
      return (
        <ConfirmDialog
          title={`Delete ${dialog.server.name}?`}
          description="This removes the server from this agent on this desktop. New sessions won’t use it. You can’t undo this."
          confirmLabel="Delete server"
          errorDescription="We couldn’t delete this server. Try again."
          destructive
          pending={removeServer.isPending}
          error={removeServer.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            removeServer.mutate(dialog.server.id, {
              onSuccess: () => {
                toast.success("Server deleted.");
                close();
              },
            })
          }
          onClose={() => {
            close();
            removeServer.reset();
          }}
        />
      );
    case "reset":
      return (
        <ConfirmDialog
          title="Reset Substrate defaults?"
          description="This replaces the agent’s instructions file and Substrate skills on this device with the saved agent settings. Local edits to those files are lost. Your other skills and MCP servers are not changed."
          confirmLabel="Reset defaults"
          errorDescription="We couldn’t reset the defaults. Try again."
          destructive
          pending={reset.isPending}
          error={reset.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                toast.success("Substrate defaults reset.");
                close();
              },
            })
          }
          onClose={() => {
            close();
            reset.reset();
          }}
        />
      );
    case "deleteSkill":
      return (
        <ConfirmDialog
          title={`Delete ${dialog.skill.name}?`}
          description="This deletes the skill’s file from this agent’s folder on this desktop. New sessions won’t use it. You can’t undo this."
          confirmLabel="Delete skill"
          errorDescription="We couldn’t delete this skill. Try again."
          destructive
          pending={remove.isPending}
          error={remove.error}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            remove.mutate(dialog.skill.id, {
              onSuccess: () => {
                toast.success("Skill deleted.");
                close();
              },
            })
          }
          onClose={() => {
            close();
            remove.reset();
          }}
        />
      );
    case undefined:
      return null;
  }
}
