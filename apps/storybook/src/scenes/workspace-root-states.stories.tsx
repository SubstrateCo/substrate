import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationSelection } from "@startup-os/ui/organizations/organization-selection";
import { CreateOrganizationForm } from "@startup-os/ui/organizations/create-organization-form";
import { organizations } from "../fixtures";

function RecoveryScene({ recoverWhileEditing = false }: { recoverWhileEditing?: boolean }) {
  const [failed, setFailed] = useState(true);
  const [loading, setLoading] = useState(false);
  return (
    <OrganizationSelection
      organizations={failed ? undefined : organizations}
      loading={loading}
      loadError={failed && !loading ? new Error("Workspace list unavailable") : null}
      onRetry={async () => {
        setLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 400));
        setFailed(false);
        setLoading(false);
      }}
      onSelect={() => {}}
      signOut={null}
      createForm={
        <div
          onInput={() => {
            if (recoverWhileEditing) setFailed(false);
          }}
        >
          <CreateOrganizationForm onSubmit={() => {}} />
        </div>
      }
    />
  );
}

const meta = { title: "Scenes/Workspace/Root states" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const DelayedRetry: Story = { render: () => <RecoveryScene /> };
export const RecoveryWhileEditing: Story = { render: () => <RecoveryScene recoverWhileEditing /> };
