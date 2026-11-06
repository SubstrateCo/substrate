import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { ContentNotice } from "@startup-os/ui/feedback/content-notice";
import { PageLoading } from "@startup-os/ui/feedback/page-loading";
import { OrganizationSwitcher } from "@startup-os/ui/organizations/organization-switcher";
import { AcceptInvitationScreen } from "@startup-os/ui/organizations/accept-invitation-screen";
import { InvitationManager } from "@startup-os/ui/organizations/invitation-manager";
import { OrganizationSelection } from "@startup-os/ui/organizations/organization-selection";
import { CreateOrganizationForm } from "@startup-os/ui/organizations/create-organization-form";
import { Composer } from "@startup-os/ui/messaging/composer";
import { ConversationPane } from "@startup-os/ui/messaging/conversation-pane";
import { MessageList } from "@startup-os/ui/messaging/message-list";
import { MessageItem } from "@startup-os/ui/messaging/message-item";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { NotFound } from "@startup-os/ui/feedback/not-found";
import { ErrorScreen } from "@startup-os/ui/feedback/error-screen";
import { organizations, invitations, conversations, messages } from "../fixtures";

const meta = { title: "Scenes/System/Feedback" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const PageNotFound: Story = {
  render: () => <NotFound homeLink={<a href="#home">Return home</a>} />,
};
export const UnexpectedError: Story = { render: () => <ErrorScreen onRetry={fn()} /> };
export const DarkError: Story = { ...UnexpectedError, globals: { theme: "dark" } };
export const MobileError: Story = {
  ...UnexpectedError,
  globals: { viewport: { value: "narrow" } },
};

function WorkspaceRecovery() {
  const [failed, setFailed] = useState(true);
  return (
    <OrganizationSelection
      organizations={failed ? undefined : organizations}
      loadError={failed ? new Error("Could not load workspaces.") : null}
      onRetry={() => setFailed(false)}
      onSelect={fn()}
      signOut={null}
      createForm={<CreateOrganizationForm onSubmit={fn()} />}
    />
  );
}

function SwitcherRecovery({ loading = false }: { loading?: boolean }) {
  const [failed, setFailed] = useState(!loading);
  return (
    <div className="p-6">
      <OrganizationSwitcher
        organizationId="studio"
        name="Launch Studio"
        organizations={failed || loading ? [] : organizations}
        loading={loading}
        loadError={failed ? new Error("Internal service details must not be shown") : null}
        onRetry={() => setFailed(false)}
        onSelect={fn()}
        manageHref="#workspaces"
      />
    </div>
  );
}

function InvitationRecovery() {
  const [failed, setFailed] = useState(true);
  return (
    <AcceptInvitationScreen
      invitation={
        failed
          ? undefined
          : { organizationName: "Launch Studio", role: "member", email: "taylor@example.com" }
      }
      failed={failed}
      onRetry={() => setFailed(false)}
      available
      onAccept={fn()}
      signOut={null}
      workspacesHref="#workspaces"
    />
  );
}

function InvitationActionRecovery() {
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-3xl p-6">
      <InvitationManager
        invitations={invitations}
        error={failed ? new Error("Unexpected server failure") : null}
        message={sent ? "Invitation email sent." : undefined}
        onRetry={fn()}
        onInvite={() => {
          setFailed(!failed);
          setSent(failed);
        }}
        onCancel={fn()}
      />
    </div>
  );
}

function MessageActionRecovery() {
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-xl p-4">
      {sent && (
        <ContentNotice
          title="Message sent"
          description="Your message is now in the conversation."
        />
      )}
      <Composer
        label="Message #general"
        error={failed ? new Error("Unexpected server failure") : null}
        onSend={(_, onSuccess) => {
          if (!failed) setFailed(true);
          else {
            setFailed(false);
            setSent(true);
            onSuccess();
          }
        }}
      />
    </div>
  );
}

function WorkspaceDetails({ loading = false }: { loading?: boolean }) {
  const [failed, setFailed] = useState(!loading);
  return (
    <WorkspaceShell
      name="Taylor Kim"
      view="messages"
      onViewChange={fn()}
      showOrganizationSettings={false}
      switcher={null}
      signOut={null}
      loading={loading}
      error={failed ? new Error("Metadata failed") : null}
      onRetry={() => setFailed(false)}
    >
      <div className="p-6">
        <ContentNotice
          title="Your workspace stays open"
          description="A details refresh does not replace your current page."
        />
      </div>
    </WorkspaceShell>
  );
}

export const WorkspaceRetry: Story = { render: () => <WorkspaceRecovery /> };
export const SwitcherRetry: Story = { render: () => <SwitcherRecovery /> };
export const SwitcherLoading: Story = { render: () => <SwitcherRecovery loading /> };
export const InvitationRetry: Story = { render: () => <InvitationRecovery /> };
export const InvitationActionError: Story = { render: () => <InvitationActionRecovery /> };
export const MessageActionError: Story = { render: () => <MessageActionRecovery /> };
export const WorkspaceDetailsError: Story = { render: () => <WorkspaceDetails /> };
export const WorkspaceDetailsLoading: Story = { render: () => <WorkspaceDetails loading /> };
export const PagePending: Story = { render: () => <PageLoading /> };
export const ListLoading: Story = {
  render: () => (
    <div className="mx-auto max-w-xl p-6">
      <LoadingState label="Loading invitations…" />
    </div>
  ),
};
export const Unavailable: Story = {
  render: () => (
    <div className="mx-auto max-w-xl p-6">
      <ContentNotice
        title="Invitation unavailable"
        description="Ask the workspace owner for a new invitation."
      />
    </div>
  ),
};
export const LoadError: Story = {
  render: () => (
    <div className="mx-auto max-w-xl p-6">
      <ErrorState
        title="Couldn’t load invitations"
        description="Your invitations are unavailable. Please try again."
        onRetry={fn()}
      />
    </div>
  ),
};
export const DarkLoadError: Story = { ...LoadError, globals: { theme: "dark" } };
export const DarkLoading: Story = { ...ListLoading, globals: { theme: "dark" } };
export const RefreshError: Story = {
  render: () => (
    <div className="flex h-dvh">
      <ConversationPane
        conversation={conversations[0]}
        error={new Error("Network request failed")}
        onRetry={fn()}
        onToggleMembers={fn()}
        messages={
          <MessageList>
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} onReact={fn()} />
            ))}
          </MessageList>
        }
        composer={<Composer label="Message #general" onSend={fn()} />}
      />
    </div>
  ),
};
