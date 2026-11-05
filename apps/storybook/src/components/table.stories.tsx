import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "@startup-os/ui/table";
import { Button } from "@startup-os/ui/primitives/button";

type Invitation = { id: string; email: string; expiresAt: string | null };
const invitations: Invitation[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index + 1),
  email: `person-${String(index + 1).padStart(2, "0")}@example.com`,
  expiresAt: index === 22 ? null : new Date(Date.UTC(2026, 10, 23 - index, 10, 30)).toISOString(),
}));
const column = createAppColumnHelper<Invitation>();
const columns = column.columns([
  column.accessor("email", { header: "Email" }),
  dateTimeColumn<Invitation>((invitation) => invitation.expiresAt, {
    id: "expiresAt",
    header: "Expires",
  }),
]);

function TablePreview({
  state = "ready",
}: {
  state?: "ready" | "empty" | "loading" | "error" | "refresh-error" | "access-error";
}) {
  const [data, setData] = useState(state === "empty" || state === "error" ? [] : invitations);
  const [failed, setFailed] = useState(["error", "refresh-error", "access-error"].includes(state));
  const table = useAppTable({ columns, data, getRowId: (row) => row.id });
  return (
    <div className="w-full min-w-0 space-y-4 p-4">
      <AppTable
        table={table}
        name="Invitations"
        loading={state === "loading"}
        loadingMessage="Loading invitations…"
        error={
          failed
            ? Object.assign(new Error("Could not load invitations."), {
                status: state === "access-error" ? 403 : 503,
              })
            : null
        }
        errorTitle="Couldn’t load invitations"
        onRetry={() => {
          setFailed(false);
          setData(invitations);
        }}
        emptyMessage="No invitations yet."
      />
      {state === "ready" && (
        <Button variant="outline" onClick={() => setData(invitations.slice(0, 1))}>
          Keep first invitation
        </Button>
      )}
    </div>
  );
}

const meta = { title: "Components/Table", component: TablePreview } satisfies Meta<
  typeof TablePreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invitations: Story = {};
export const Empty: Story = { args: { state: "empty" } };
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const RefreshError: Story = { args: { state: "refresh-error" } };
export const AccessError: Story = { args: { state: "access-error" } };
export const Dark: Story = { globals: { theme: "dark" } };
