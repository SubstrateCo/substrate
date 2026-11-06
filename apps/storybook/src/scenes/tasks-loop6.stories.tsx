import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { TasksWorkspace } from "@startup-os/ui/tasks/tasks-workspace";
import { ProjectPane } from "@startup-os/ui/tasks/project-pane";
import { ProjectForm } from "@startup-os/ui/tasks/project-form";
import { ProjectSharing } from "@startup-os/ui/tasks/project-sharing";
import { Button } from "@startup-os/ui/primitives/button";
import { populatedProjects } from "./tasks-dense-fixtures";

function ProjectFrameScene({
  loading = false,
  deferredSave = false,
}: {
  loading?: boolean;
  deferredSave?: boolean;
}) {
  const [detail, setDetail] = useState(populatedProjects[0]!);
  const [ready, setReady] = useState(!loading);
  const [complete, setComplete] = useState<(() => void) | null>(null);
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
      {(!ready || complete) && (
        <div className="fixed top-4 right-4 z-50">
          <Button
            onClick={() => {
              if (complete) {
                complete();
                setComplete(null);
              } else setReady(true);
            }}
          >
            {complete ? "Complete project save" : "Resolve loading"}
          </Button>
        </div>
      )}
      <TasksWorkspace
        projects={[detail.project]}
        onRetry={() => undefined}
        renderCreate={() => null}
        renderProject={() => (
          <ProjectPane
            data={ready ? detail : undefined}
            loading={!ready}
            onRetry={() => setReady(true)}
            renderProjectEditor={(value, onDone) => (
              <ProjectForm
                project={value.project}
                pending={!!complete}
                onCancel={onDone}
                onSubmit={(draft) => {
                  const finish = () => {
                    setDetail((current) => ({
                      ...current,
                      project: { ...current.project, ...draft },
                    }));
                    onDone();
                  };
                  if (deferredSave) setComplete(() => finish);
                  else finish();
                }}
              />
            )}
            renderSettings={(value) => (
              <ProjectSharing detail={value} onShare={() => undefined} onRevoke={() => undefined} />
            )}
            renderTaskForm={() => null}
            renderTaskDetail={() => null}
          />
        )}
      />
    </WorkspaceShell>
  );
}

const meta = { title: "Projects/Scenes/Task frame", component: ProjectFrameScene } satisfies Meta<
  typeof ProjectFrameScene
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoadingTransition: Story = { args: { loading: true } };
export const DeferredProjectEdit: Story = { args: { deferredSave: true } };
