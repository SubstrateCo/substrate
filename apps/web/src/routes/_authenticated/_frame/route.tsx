import { createFileRoute, Outlet } from "@tanstack/react-router";

import { ComposerDraftProvider } from "@/components/messaging/composer/composer-drafts";
import { OrganizationAppsProvider } from "@/components/workspace/organization-apps";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

export const Route = createFileRoute("/_authenticated/_frame")({
  component: FrameLayout,
});

function FrameLayout() {
  const { session } = Route.useRouteContext();
  return (
    <ComposerDraftProvider
      key={`${session.session.id}:${session.user.id}:${session.session.activeOrganizationId ?? ""}`}
      organizationId={session.session.activeOrganizationId ?? null}
    >
      <OrganizationAppsProvider
        key={session.session.activeOrganizationId ?? ""}
        userId={session.user.id}
        organizationId={session.session.activeOrganizationId}
      >
        <WorkspaceFrame
          userId={session.user.id}
          organizationId={session.session.activeOrganizationId}
          name={session.user.name}
          image={session.user.image}
        >
          <Outlet />
        </WorkspaceFrame>
      </OrganizationAppsProvider>
    </ComposerDraftProvider>
  );
}
