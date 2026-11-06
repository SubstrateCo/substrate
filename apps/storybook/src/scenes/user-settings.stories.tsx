import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { UserSettingsLayout } from "@startup-os/ui/settings/user-settings-layout";
import { UserAppearance } from "@startup-os/ui/settings/user-appearance";
import { PictureSettings } from "@startup-os/ui/settings/picture-settings";
import { UserInvitations } from "@startup-os/ui/settings/user-invitations";

function UserSettingsScene({
  page = "profile",
  state = "ready",
}: {
  page?: "profile" | "invitations";
  state?: "ready" | "loading" | "error" | "empty" | "refresh-error" | "unavailable";
}) {
  const failed = ["error", "refresh-error", "unavailable"].includes(state);
  const error = failed
    ? Object.assign(new Error("Request failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  return (
    <UserSettingsLayout active={page} profileHref="#profile" invitationsHref="#invitations">
      {page === "profile" ? (
        <>
          <PictureSettings
            title="Profile"
            kind="avatar"
            loading={state === "loading"}
            error={error}
            value={state === "error" ? undefined : null}
            onRetry={fn()}
            onUpload={async () => {}}
            onRemove={async () => {}}
          />
          <UserAppearance />
        </>
      ) : (
        <UserInvitations
          now={Date.parse("2026-11-06T10:00:00Z")}
          invitations={
            state === "loading" || state === "empty" || state === "error"
              ? []
              : [
                  {
                    id: "current",
                    organizationName: "Launch Studio",
                    role: "member",
                    expiresAt: "2026-12-01T00:00:00Z",
                    href: "#review-current",
                  },
                  {
                    id: "expired",
                    organizationName: "Previous workspace",
                    role: "admin",
                    expiresAt: "2026-10-01T00:00:00Z",
                    href: "#review-expired",
                  },
                ]
          }
          loading={state === "loading"}
          error={error}
          onRetry={fn()}
        />
      )}
    </UserSettingsLayout>
  );
}

const meta = {
  title: "Scenes/Workspace/User settings",
  component: UserSettingsScene,
} satisfies Meta<typeof UserSettingsScene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Profile: Story = {};
export const ProfileLoading: Story = { args: { state: "loading" } };
export const ProfileError: Story = { args: { state: "error" } };
export const ProfileRefreshError: Story = { args: { state: "refresh-error" } };
export const ProfileUnavailable: Story = { args: { state: "unavailable" } };
export const Invitations: Story = { args: { page: "invitations" } };
export const InvitationsLoading: Story = { args: { page: "invitations", state: "loading" } };
export const InvitationsError: Story = { args: { page: "invitations", state: "error" } };
export const InvitationsEmpty: Story = { args: { page: "invitations", state: "empty" } };
export const InvitationsRefreshError: Story = {
  args: { page: "invitations", state: "refresh-error" },
};
export const InvitationsUnavailable: Story = {
  args: { page: "invitations", state: "unavailable" },
};
export const DarkProfile: Story = { globals: { theme: "dark" } };
export const DarkInvitations: Story = { args: { page: "invitations" }, globals: { theme: "dark" } };
