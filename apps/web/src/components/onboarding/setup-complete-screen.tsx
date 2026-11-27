import { linkOptions, useRouter } from "@tanstack/react-router";

import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthNavLink } from "@/components/auth/auth-link";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { Separator } from "@/components/ui/separator";
import { invitationRoles } from "@/lib/organizations/member-policy";

export function SetupCompleteScreen({
  organizationId,
  name,
  role,
  conversationId,
}: {
  organizationId: string;
  name: string;
  /** The viewer's stored role in the organization. */
  role: string;
  conversationId?: string;
}) {
  const router = useRouter();
  const browserLink = linkOptions({
    to: "/messages",
    search: { workspaceId: organizationId, conversationId },
  });
  const destination = router.buildLocation(browserLink).href;
  return (
    <AuthFrame
      title="Your workspace is ready"
      description={
        <>
          You’re a member of{" "}
          <span className="font-medium wrap-anywhere text-foreground">{name}</span>.
        </>
      }
      actions={
        <>
          <AuthNavLink to="/organizations">Workspaces</AuthNavLink>
          <SignOutButton destination="/onboarding" />
        </>
      }
    >
      <DesktopInstall destination={destination} browserLink={browserLink} />
      {invitationRoles(role).length > 0 && (
        <>
          <Separator />
          <InvitationManager organizationId={organizationId} viewerRole={role} />
        </>
      )}
    </AuthFrame>
  );
}
