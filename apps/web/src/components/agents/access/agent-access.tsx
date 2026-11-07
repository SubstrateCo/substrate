import type { AgentConfiguration, AgentAccessChange } from "@startup-os/contracts/agents";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { changeAgentAccess } from "@/api/agents/requests";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agentAccessQueryOptions } from "@/queries/agents/access";
import { queryKeys } from "@/queries/keys";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import { toast } from "sonner";

export function AgentAccess({
  userId,
  organizationId,
  agent,
}: {
  userId: string;
  organizationId?: string | null;
  agent?: AgentConfiguration;
}) {
  if (!agent)
    return <p className="text-sm text-muted-foreground">Save the agent to manage access.</p>;
  if (!organizationId) return <p className="text-sm text-muted-foreground">Select a workspace.</p>;
  return (
    <ProjectAccess
      key={`${organizationId}/${agent.id}`}
      userId={userId}
      organizationId={organizationId}
      agent={agent}
    />
  );
}

function ProjectAccess({
  userId,
  organizationId,
  agent,
}: {
  userId: string;
  organizationId: string;
  agent: AgentConfiguration;
}) {
  const client = useQueryClient();
  const access = useQuery(agentAccessQueryOptions(userId, organizationId, agent.id));
  const [editing, setEditing] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState<"view" | "comment" | "edit">("view");
  const [reviewing, setReviewing] = useState(false);
  const change = useMutation({
    mutationFn: (input: AgentAccessChange) => changeAgentAccess(input),
    onError: (error) => {
      if (!editing)
        toast.error(actionErrorMessage(error, "Couldn’t revoke access. Please try again."));
    },
    onSuccess: async (_, input) => {
      toast.success(input.level ? "Project access updated." : "Project access revoked.");
      await Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.agentAccess(userId, organizationId, agent.id),
        }),
        client.invalidateQueries({ queryKey: queryKeys.tasks(organizationId) }),
        client.invalidateQueries({ queryKey: queryKeys.context(organizationId) }),
      ]);
      setEditing(false);
      setReviewing(false);
    },
  });
  const projects = access.data ?? [];
  const grants = projects.filter((project) => project.level);
  const selected = projects.find((project) => project.entityId === projectId);
  function start() {
    change.reset();
    setProjectId(projects.find((project) => project.canManage)?.entityId ?? "");
    setLevel("view");
    setReviewing(false);
    setEditing(true);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Workspace access</h3>
        <Button
          type="button"
          variant="outline"
          disabled={!agent.enabled || !projects.some((project) => project.canManage)}
          onClick={start}
        >
          Grant access
        </Button>
      </div>
      <h4 className="text-xs font-medium text-muted-foreground">Projects · Current workspace</h4>
      {access.isPending && <LoadingState label="Loading project access" variant="compact" />}
      {access.error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {access.error.message}
          </p>
          <Button type="button" variant="outline" onClick={() => void access.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {access.data && !grants.length && (
        <p className="text-sm text-muted-foreground">No project grants.</p>
      )}
      <ul className="grid gap-3">
        {grants.map((project) => (
          <li
            key={project.entityId}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-4"
          >
            <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Link
                to="/tasks"
                search={{ projectId: project.entityId }}
                className="flex items-center gap-1 font-medium wrap-anywhere"
              >
                {project.name}
                <ArrowUpRight className="size-3 shrink-0" />
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">Direct · {project.level}</p>
            </div>
            {project.canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={change.isPending}
                onClick={() => {
                  change.reset();
                  change.mutate({
                    organizationId,
                    agentId: agent.id,
                    projectEntityId: project.entityId,
                    level: null,
                  });
                }}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!change.isPending) setEditing(open);
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Grant workspace access</DialogTitle>
          </DialogHeader>
          {reviewing && selected ? (
            <section aria-label="Access change review" className="space-y-3">
              <p>
                Give {agent.name} <strong>{level}</strong> access to {selected.name}?
              </p>
              <p className="text-sm text-muted-foreground">
                Includes every task, subtask, and comment in this project.
              </p>
              <p className="text-xs text-muted-foreground">Current workspace only.</p>
            </section>
          ) : (
            <div className="space-y-4">
              <Field>
                <FieldLabel htmlFor="agent-access-project">Project</FieldLabel>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="agent-access-project" className="w-full">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects
                      .filter((project) => project.canManage)
                      .map((project) => (
                        <SelectItem key={project.entityId} value={project.entityId}>
                          {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-access-level">Permission</FieldLabel>
                <Select
                  value={level}
                  onValueChange={(value) => {
                    if (value === "view" || value === "comment" || value === "edit")
                      setLevel(value);
                  }}
                >
                  <SelectTrigger id="agent-access-level" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="comment">Comment</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          {change.error && (
            <p role="alert" className="text-sm text-destructive">
              {change.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={change.isPending}
              onClick={() => (reviewing ? setReviewing(false) : setEditing(false))}
            >
              {reviewing ? "Back" : "Cancel"}
            </Button>
            <PendingButton
              type="button"
              disabled={!selected}
              pending={change.isPending}
              pendingLabel={reviewing ? "Confirm access" : "Review access"}
              onClick={() => {
                if (!reviewing) setReviewing(true);
                else
                  change.mutate({
                    organizationId,
                    agentId: agent.id,
                    projectEntityId: projectId,
                    level,
                  });
              }}
            >
              {reviewing ? "Confirm access" : "Review access"}
            </PendingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
