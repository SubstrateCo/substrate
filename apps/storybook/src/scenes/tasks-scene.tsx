import { useState } from "react";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { TasksWorkspace } from "@startup-os/ui/tasks/tasks-workspace";
import { ProjectPane } from "@startup-os/ui/tasks/project-pane";
import { ProjectForm } from "@startup-os/ui/tasks/project-form";
import { TaskForm } from "@startup-os/ui/tasks/task-form";
import { TaskDetail } from "@startup-os/ui/tasks/task-detail";
import { TaskComments } from "@startup-os/ui/tasks/task-comments";
import { ProjectSharing } from "@startup-os/ui/tasks/project-sharing";
import type { ProjectDetail, TaskComment } from "@startup-os/ui/tasks/types";
import { taskProject } from "./tasks-fixtures";
import { populatedProjects, largeProjects } from "./tasks-dense-fixtures";

export function TasksScene({
  state = "ready",
  projectState = "ready",
  level = "owner",
  failComment = false,
  dataset = "simple",
}: {
  state?: "ready" | "empty" | "loading" | "error" | "unavailable";
  projectState?: "ready" | "empty" | "loading" | "error" | "unavailable";
  level?: ProjectDetail["level"];
  failComment?: boolean;
  dataset?: "simple" | "populated" | "large";
}) {
  const [currentState, setState] = useState(state);
  const [currentProjectState, setProjectState] = useState(projectState);
  const initialProjects = {
    simple: [taskProject],
    populated: populatedProjects,
    large: largeProjects,
  }[dataset];
  const [details, setDetails] = useState<Record<string, ProjectDetail>>(() =>
    Object.fromEntries(
      initialProjects.map((detail) => [
        detail.project.entityId,
        { ...detail, level, tasks: projectState === "empty" ? [] : detail.tasks },
      ]),
    ),
  );
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]!.project.entityId);
  const detail = details[selectedProjectId]!;
  const setDetail = (value: ProjectDetail) =>
    setDetails((previous) => ({ ...previous, [value.project.entityId]: value }));
  const [projects, setProjects] = useState(
    state === "empty" ? [] : initialProjects.map((detail) => detail.project),
  );
  const [comments, setComments] = useState<Record<string, TaskComment[]>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, Error | null>>({});
  const [shouldFail, setShouldFail] = useState(failComment);
  const requestError = (value: string) => {
    if (value === "error") return new Error("Offline");
    if (value === "unavailable") return new Error("Project or task not found or access denied.");
    return null;
  };
  return (
    <WorkspaceShell
      name="Alex Morgan"
      view="tasks"
      onViewChange={() => undefined}
      showOrganizationSettings
      organizationName="Launch Studio"
      switcher={<span>OS</span>}
      signOut={<span>Sign out</span>}
    >
      <TasksWorkspace
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        loading={currentState === "loading"}
        error={requestError(currentState)}
        onRetry={() => setState("ready")}
        renderCreate={(onSaved, onCancel) => (
          <ProjectForm
            onCancel={onCancel}
            onSubmit={(draft) => {
              const project = { entityId: crypto.randomUUID(), ...draft };
              setProjects([...projects, project]);
              setDetail({ ...detail, project, tasks: [] });
              onSaved(project.entityId);
            }}
          />
        )}
        renderProject={() => (
          <ProjectPane
            key={detail.project.entityId}
            data={
              currentProjectState === "loading" || currentProjectState === "error"
                ? undefined
                : detail
            }
            loading={currentProjectState === "loading"}
            error={requestError(currentProjectState)}
            onRetry={() => setProjectState("ready")}
            renderProjectEditor={(value, onDone) => (
              <ProjectForm
                project={value.project}
                onCancel={onDone}
                onSubmit={(draft) => {
                  const project = { ...value.project, ...draft };
                  setDetail({ ...detail, project });
                  setProjects(
                    projects.map((item) => (item.entityId === project.entityId ? project : item)),
                  );
                  onDone();
                }}
              />
            )}
            renderTaskForm={(value, parentTaskEntityId, onSaved, onCancel) => (
              <TaskForm
                detail={value}
                parentTaskEntityId={parentTaskEntityId}
                onCancel={onCancel}
                onSubmit={(draft) => {
                  const task = {
                    ...draft,
                    entityId: crypto.randomUUID(),
                    projectEntityId: value.project.entityId,
                    parentTaskEntityId: parentTaskEntityId ?? null,
                  };
                  setDetail({ ...detail, tasks: [...detail.tasks, task] });
                  onSaved(task.entityId);
                }}
              />
            )}
            renderTaskDetail={(value, task, onClose, onSubtask) => (
              <TaskDetail
                key={task.entityId}
                detail={value}
                task={task}
                onClose={onClose}
                onSubtask={onSubtask}
                renderEditor={(onDone) => (
                  <TaskForm
                    detail={value}
                    task={task}
                    onCancel={onDone}
                    onSubmit={(draft) => {
                      setDetail({
                        ...detail,
                        tasks: detail.tasks.map((item) =>
                          item.entityId === task.entityId ? { ...item, ...draft } : item,
                        ),
                      });
                      onDone();
                    }}
                  />
                )}
              >
                <TaskComments
                  comments={comments[task.entityId] ?? []}
                  canComment={level !== "view"}
                  actionError={commentErrors[task.entityId]}
                  onRetry={() => undefined}
                  onSend={(body, onSuccess) => {
                    if (shouldFail) {
                      setShouldFail(false);
                      setCommentErrors({ ...commentErrors, [task.entityId]: new Error("Offline") });
                      return;
                    }
                    setCommentErrors({ ...commentErrors, [task.entityId]: null });
                    setComments({
                      ...comments,
                      [task.entityId]: [
                        ...(comments[task.entityId] ?? []),
                        {
                          id: crypto.randomUUID(),
                          body,
                          authorName: "Alex Morgan",
                          createdAt: "2026-11-05T12:00:00Z",
                        },
                      ],
                    });
                    onSuccess();
                  }}
                />
              </TaskDetail>
            )}
            renderSettings={(value) => (
              <>
                <ProjectSharing
                  detail={value}
                  onShare={(actorEntityId, permission) => {
                    const actor = value.actors.find((item) => item.entityId === actorEntityId)!;
                    setDetail({
                      ...detail,
                      members: [
                        ...detail.members.filter((item) => item.actorEntityId !== actorEntityId),
                        { actorEntityId, name: actor.name, type: actor.type, level: permission },
                      ],
                    });
                  }}
                  onRevoke={(actorEntityId) =>
                    setDetail({
                      ...detail,
                      members: detail.members.filter(
                        (item) => item.actorEntityId !== actorEntityId,
                      ),
                    })
                  }
                />
              </>
            )}
          />
        )}
      />
    </WorkspaceShell>
  );
}
