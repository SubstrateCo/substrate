import { startupSkillIds, startupSkills, type HarnessKind } from "@startup-os/contracts/harness";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { SkillEditor } from "../editors/skill-editor";
import { SettingsList, SettingsNote, SettingsSection } from "../layout/settings-section";
import { McpServerRow, StartupSkills } from "./startup-configuration";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { desktopLocalConfiguration } from "@/lib/desktop/agents/local-configuration";
import { queryKeys } from "@/queries/keys";
import { Monitor, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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
  const controller = desktopLocalConfiguration(harness, agentId);
  const client = useQueryClient();
  const key = queryKeys.localAgentConfiguration(
    userId,
    organizationId ?? "",
    agentId ?? "",
    harness,
  );
  const available = !!controller && !!organizationId;
  const [editing, setEditing] = useState<{ id?: string }>();
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const configuration = useQuery({
    queryKey: key,
    queryFn: controller && organizationId ? () => controller.scan() : skipToken,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!controller || !organizationId) throw new Error("Select a workspace in the desktop app.");
      await controller.deleteSkill(id);
    },
    onSuccess: async () => {
      toast.success("Skill deleted.");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const [resetting, setResetting] = useState(false);
  const reset = useMutation({
    mutationFn: async () => {
      if (!controller || !organizationId) throw new Error("Select a workspace in the desktop app.");
      await controller.resetDefaults();
    },
    onSuccess: async () => {
      toast.success("Startup OS defaults reset.");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  // Startup OS rewrites its own skills on every sync, so they are not listed as editable.
  const isStartupSkill = (id: string) => startupSkillIds.includes(id);
  const skills = configuration.data?.skills.filter((skill) => !isStartupSkill(skill.id)) ?? [];
  const defaultSkills = !available && defaults ? startupSkills : [];
  const managedSkills = configuration.data
    ? configuration.data.skills.filter((skill) => isStartupSkill(skill.id))
    : defaultSkills;
  const servers = configuration.data?.mcpServers ?? [];
  const skill = skills.find((item) => item.id === editing?.id);
  const refresh = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label="Refresh configuration"
      disabled={!available || configuration.isFetching}
      onClick={() => void configuration.refetch()}
    >
      <RefreshCw className={configuration.isFetching ? "animate-spin" : ""} />
    </Button>
  );
  const status = (
    <>
      {!available && (
        <SettingsNote icon={<Monitor />}>
          {agentId
            ? `Open this agent in the desktop app to see and edit the ${section === "skills" ? "skills" : "MCP servers"} in its local folder.`
            : "Save this agent to edit its local configuration."}
        </SettingsNote>
      )}
      {available && configuration.isPending && (
        <LoadingState label="Loading native configuration" variant="compact" />
      )}
      {configuration.error && (
        <p role="alert" className="text-sm text-destructive">
          {configuration.error.message}
        </p>
      )}
    </>
  );
  const content =
    section === "skills" ? (
      <SettingsSection
        title="Skills"
        description="Focused how-tos this agent loads when a task needs them."
        actions={
          <>
            {refresh}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!available || reset.isPending}
              onClick={() => setResetting(true)}
            >
              <RotateCcw />
              Reset defaults
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!available || configuration.isFetching}
              onClick={() => setEditing({})}
            >
              <Plus />
              Create skill
            </Button>
          </>
        }
      >
        {status}
        {managedSkills.length > 0 && (
          <StartupSkills skills={managedSkills} scanned={!!configuration.data} />
        )}
        {configuration.data && (
          <SettingsList title="Your skills">
            {skills.length ? (
              skills.map((item) => (
                <CatalogRow
                  key={item.id}
                  name={item.name}
                  detail={item.description}
                  disabled={remove.isPending}
                  onEdit={() => setEditing({ id: item.id })}
                  onDelete={() => setDeleting({ id: item.id, name: item.name })}
                />
              ))
            ) : (
              <li className="px-4 py-3 text-sm text-muted-foreground">No custom skills.</li>
            )}
          </SettingsList>
        )}
      </SettingsSection>
    ) : (
      <SettingsSection
        title="MCP servers"
        description="Servers that give this agent extra tools."
        actions={refresh}
      >
        {status}
        {(defaults || configuration.data) && (
          <SettingsList
            description={
              defaults ? "Startup OS provides the built-in server when this agent runs." : undefined
            }
          >
            {defaults && <McpServerRow name="startup-os" builtIn />}
            {servers.map((server) => (
              <McpServerRow key={server.id} name={server.name} />
            ))}
            {configuration.data && !servers.length && !defaults && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No MCP servers.</li>
            )}
          </SettingsList>
        )}
      </SettingsSection>
    );
  return (
    <div>
      {content}
      {editing && (
        <SkillEditor
          skill={skill}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            if (!controller || !organizationId)
              throw new Error("Select a workspace in the desktop app.");
            await controller.saveSkill(input);
            toast.success("Skill saved.");
            await client.invalidateQueries({ queryKey: key });
            setEditing(undefined);
          }}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Reset Startup OS defaults?"
          description="This replaces the agent's instructions file and Startup OS skills on this device with the saved agent settings. Local edits to those files are lost. Your other skills and MCP servers are not changed."
          confirmLabel="Reset"
          pendingLabel="Resetting"
          destructive
          pending={reset.isPending}
          error={reset.error}
          onConfirm={() => reset.mutate(undefined, { onSuccess: () => setResetting(false) })}
          onClose={() => {
            setResetting(false);
            reset.reset();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="This deletes the selected definition. Native conversation history is not deleted. This cannot be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting"
          destructive
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })}
          onClose={() => {
            setDeleting(undefined);
            remove.reset();
          }}
        />
      )}
    </div>
  );
}
