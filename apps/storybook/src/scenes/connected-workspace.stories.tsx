import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { WorkspaceHomeLink } from "@startup-os/ui/workspace/workspace-home-link";
import { WorkspaceTools } from "@startup-os/ui/context/workspace-tools";
import { WorkspaceSearch, type SearchKind } from "@startup-os/ui/context/workspace-search";
import { NotificationList } from "@startup-os/ui/context/notification-list";
import { ContentNotice } from "@startup-os/ui/feedback/content-notice";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { fn, userEvent } from "storybook/test";

function WorkspaceToolsScene({
  initialView = "messages",
}: {
  initialView?: "messages" | "notifications";
}) {
  const [view, setView] = useState<
    "messages" | "tasks" | "notifications" | "user-settings" | "organization-settings"
  >(initialView);
  const [kind, setKind] = useState<SearchKind>("all");
  const [read, setRead] = useState(false);
  return (
    <WorkspaceShell
      name="Taylor Kim"
      view={view}
      hasUnreadNotifications={!read}
      showOrganizationSettings
      organizationName="Launch Studio"
      onViewChange={setView}
      switcher={<WorkspaceHomeLink href="#workspaces" />}
      signOut={<SignOutButton onSignOut={fn()} />}
    >
      <WorkspaceTools
        renderSearch={(onClose, query, setQuery) => (
          <WorkspaceSearch
            query={query}
            hideInput
            kind={kind}
            related={false}
            results={[
              { id: "launch", kind: "task", title: "Ship the launch", href: "#task" },
              { id: "review", kind: "task", title: "Review the onboarding flow", href: "#review" },
              { id: "project", kind: "project", title: "Customer portal", href: "#project" },
              {
                id: "message",
                kind: "message",
                title: "The updated assets are ready for review",
                href: "#message",
              },
              { id: "channel", kind: "conversation", title: "Partner launch", href: "#channel" },
            ].filter(
              (item) =>
                (kind === "all" || kind === item.kind) &&
                item.title.toLowerCase().includes(query.toLowerCase()),
            )}
            loading={false}
            hasMore={false}
            hasPrevious={false}
            onQueryChange={setQuery}
            onKindChange={setKind}
            onRelated={fn()}
            onClearRelated={fn()}
            onMore={fn()}
            onFirst={fn()}
            onRetry={fn()}
            onClose={onClose}
          />
        )}
      />
      {view === "notifications" ? (
        <NotificationList
          items={[
            {
              id: "assignment",
              kind: "assignment",
              title: "Ship the launch",
              href: "#task",
              read,
            },
            {
              id: "mention",
              kind: "mention",
              title: "Carol Rivera mentioned you in #team-updates",
              href: "#message",
              read: true,
            },
            {
              id: "reply",
              kind: "reply",
              title: "Dana Patel replied in Partner launch",
              href: "#thread",
              read: true,
            },
          ]}
          loading={false}
          onRetry={fn()}
          onRead={() => setRead(true)}
          onOpen={(_item, event) => {
            event.preventDefault();
            setRead(true);
          }}
        />
      ) : (
        <ContentNotice
          title="Your connected workspace"
          description="Use Search workspace or Notifications. Press Ctrl+K or Command+K to search, and Escape to close."
        />
      )}
    </WorkspaceShell>
  );
}

const meta = {
  title: "Scenes/Workspace/Connected tools",
  component: WorkspaceToolsScene,
} satisfies Meta<typeof WorkspaceToolsScene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Notifications: Story = { args: { initialView: "notifications" } };
export const SearchOpen: Story = {
  play: async () => {
    await userEvent.keyboard("{Control>}k{/Control}");
  },
};
export const DarkSearch: Story = { ...SearchOpen, globals: { theme: "dark" } };
export const DarkNotifications: Story = {
  args: { initialView: "notifications" },
  globals: { theme: "dark" },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const Narrow: Story = { globals: { viewport: { value: "narrow" } } };
