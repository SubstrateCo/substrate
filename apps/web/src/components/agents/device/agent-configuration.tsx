import {
  startupSkillIds,
  startupSkills,
  type HarnessKind,
  type HarnessMcpServer,
  type HarnessSkill,
} from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import type { AgentSection } from "../editors/agent-form";
import { SkillEditor } from "../editors/skill-editor";
import { ConfigurationStatus } from "./configuration-status";
import { McpServerDialogs } from "./mcp-server-dialogs";
import { McpServersSection } from "./mcp-servers-section";
import { SkillsSection } from "./skills-section";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
        onReset={() => {
          rememberLauncher();
          setResetting(true);
        }}
        onCreate={() => {
          rememberLauncher();
          setEditing({});
        }}
        onEdit={(id) => {
          rememberLauncher();
          setEditing({ id });
        }}
        onDelete={(skill) => {
          rememberLauncher();
          setDeleting(skill);
        }}
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
      <McpServerDialogs
        editing={editingServer}
        deleting={deletingServer}
        servers={servers}
        saveServer={saveServer}
        removeServer={removeServer}
        onRestoreFocus={restoreFocus}
        onEditDone={() => setEditingServer(undefined)}
        onDeleteDone={() => setDeletingServer(undefined)}
      />
      {resetting && (
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
