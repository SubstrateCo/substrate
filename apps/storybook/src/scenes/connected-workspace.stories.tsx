import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { WorkspaceHomeLink } from "@startup-os/ui/workspace/workspace-home-link";
import { WorkspaceTools } from "@startup-os/ui/context/workspace-tools";
import { WorkspaceSearch, type SearchKind } from "@startup-os/ui/context/workspace-search";
import { NotificationList } from "@startup-os/ui/context/notification-list";
import { ContentNotice } from "@startup-os/ui/feedback/content-notice";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { fn } from "storybook/test";

function WorkspaceToolsScene() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind>("all");
  const [read, setRead] = useState(false);
  return (
    <WorkspaceShell
      name="Taylor Kim"
      view="messages"
      showOrganizationSettings
      organizationName="Launch Studio"
      onViewChange={fn()}
      switcher={<WorkspaceHomeLink href="#workspaces" />}
      signOut={<SignOutButton onSignOut={fn()} />}
    >
      <WorkspaceTools
        renderSearch={(onClose) => (
          <WorkspaceSearch
            query={query}
            kind={kind}
            related={false}
            results={[
              { id: "launch", kind: "task", title: "Ship the launch", href: "#task" },
            ].filter(
              (item) =>
                (kind === "all" || kind === "task") &&
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
        renderNotifications={(onClose) => (
          <NotificationList
            items={[
              {
                id: "assignment",
                kind: "assignment",
                title: "Ship the launch",
                href: "#task",
                read,
              },
            ]}
            loading={false}
            onRetry={fn()}
            onRead={() => setRead(true)}
            onOpen={(_item, event) => {
              event.preventDefault();
              setRead(true);
            }}
            onClose={onClose}
          />
        )}
      />
      <ContentNotice
        title="Your connected workspace"
        description="Use Search workspace or Notifications. Press Ctrl+K or Command+K to search, and Escape to close."
      />
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
export const Dark: Story = { globals: { theme: "dark" } };
export const Narrow: Story = { globals: { viewport: { value: "narrow" } } };
