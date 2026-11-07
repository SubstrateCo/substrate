import type { HarnessKind } from "@startup-os/contracts/harness";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { DeleteDefinitionDialog } from "../catalog/delete-definition-dialog";
import type { AgentSection } from "../editors/agent-editor";
import { SkillEditor } from "../editors/skill-editor";
import { Button } from "@/components/ui/button";
import { desktopLocalConfiguration } from "@/lib/desktop/agents/local-configuration";
import { queryKeys } from "@/queries/keys";
import { Blocks, RefreshCw, Sparkles } from "lucide-react";

export function AgentConfiguration({
  userId,
  organizationId,
  harness,
  section,
  defaults,
}: {
  userId: string;
  organizationId?: string | null;
  harness: HarnessKind;
  section: AgentSection;
  defaults: boolean;
}) {
  const controller = desktopLocalConfiguration(harness);
  const client = useQueryClient();
  const key = queryKeys.localAgentConfiguration(userId, organizationId ?? "", harness);
  const available = !!controller && !!organizationId;
  const [editing, setEditing] = useState<{ id?: string }>();
  const [deleting, setDeleting] = useState<{ id: string; name: string }>();
  const configuration = useQuery({
    queryKey: key,
    enabled: available,
    queryFn: () => {
      if (!controller || !organizationId) throw new Error("Select a workspace in the desktop app.");
      return controller.scan();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!controller || !organizationId) throw new Error("Select a workspace in the desktop app.");
      await controller.deleteSkill(id);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const skills =
    configuration.data?.skills.filter((skill) => skill.id !== "startup-os-default") ?? [];
  const nativeDefault =
    configuration.data?.skills.some((skill) => skill.id === "startup-os-default") ?? false;
  const servers = configuration.data?.mcpServers ?? [];
  const skill = skills.find((item) => item.id === editing?.id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{section === "skills" ? "Skills" : "MCP servers"}</h3>
        <div className="flex gap-2">
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
          {section === "skills" && (
            <Button
              type="button"
              variant="outline"
              disabled={!available || configuration.isFetching}
              onClick={() => setEditing({})}
            >
              Create skill
            </Button>
          )}
        </div>
      </div>
      {(defaults || (section === "skills" && nativeDefault)) && (
        <div className="flex items-start gap-3 rounded-lg border p-4">
          {section === "skills" ? (
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          ) : (
            <Blocks className="mt-0.5 size-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">Startup OS</p>
            {section === "mcps" && (
              <p className="mt-1 text-xs text-muted-foreground">hello_world</p>
            )}
          </div>
          <span className="rounded bg-accent px-2 py-0.5 text-xs text-muted-foreground">
            {defaults ? "Built-in" : "Native"}
          </span>
        </div>
      )}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Native configuration</h4>
        {!available && (
          <p className="text-sm text-muted-foreground">Select a workspace in the desktop app.</p>
        )}
        {available && configuration.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {configuration.error && (
          <p role="alert" className="text-sm text-destructive">
            {configuration.error.message}
          </p>
        )}
        {configuration.data &&
          section === "skills" &&
          (skills.length ? (
            <ul className="grid gap-3">
              {skills.map((item) => (
                <CatalogRow
                  key={item.id}
                  name={item.name}
                  detail={item.description}
                  disabled={remove.isPending}
                  onEdit={() => setEditing({ id: item.id })}
                  onDelete={() => setDeleting({ id: item.id, name: item.name })}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No custom skills.</p>
          ))}
        {configuration.data &&
          section === "mcps" &&
          (servers.length ? (
            <ul className="divide-y rounded-lg border">
              {servers.map((server) => (
                <li key={server.id} className="flex min-w-0 flex-wrap items-start gap-3 p-4">
                  <Blocks className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium wrap-anywhere">{server.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {server.transport === "http" ? "HTTP" : "Standard I/O"} · Native
                      {server.readOnly ? " · Read-only" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No native MCP servers.</p>
          ))}
      </div>
      {editing && (
        <SkillEditor
          skill={skill}
          pending={false}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            if (!controller || !organizationId)
              throw new Error("Select a workspace in the desktop app.");
            await controller.saveSkill(input);
            await client.invalidateQueries({ queryKey: key });
            setEditing(undefined);
          }}
        />
      )}
      {deleting && (
        <DeleteDefinitionDialog
          name={deleting.name}
          pending={remove.isPending}
          onClose={() => setDeleting(undefined)}
          onDelete={async () => {
            await remove.mutateAsync(deleting.id);
            setDeleting(undefined);
          }}
        />
      )}
    </div>
  );
}
