import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceTaskFields } from "@startup-os/ui/context/source-task-fields";
import { Button } from "@startup-os/ui/primitives/button";
import { taskProject } from "../scenes/tasks-fixtures";

function RefreshPreview() {
  const [state, setState] = useState("ready");
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <div className="flex flex-wrap gap-2" aria-label="Fixture controls">
        <Button variant="outline" onClick={() => setState("loading")}>
          Refresh fields
        </Button>
        <Button variant="outline" onClick={() => setState("error")}>
          Fail refresh
        </Button>
        <Button variant="outline" onClick={() => setState("denied")}>
          Revoke access
        </Button>
      </div>
      <SourceTaskFields
        detail={taskProject}
        loading={state === "loading"}
        loadError={
          state === "error" || state === "denied"
            ? Object.assign(new Error("Request failed"), { status: state === "denied" ? 403 : 503 })
            : null
        }
        onRetry={() => setState("ready")}
        sourceText="Customer asked for a launch checklist."
        onSubmit={() => setState("saved")}
        onCancel={() => setState("ready")}
      />
      {state === "saved" && <p role="status">Draft submitted.</p>}
    </div>
  );
}

const meta = { title: "Workspace/Context refresh", component: RefreshPreview } satisfies Meta<
  typeof RefreshPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
