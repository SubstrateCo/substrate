import { useRouter } from "@tanstack/react-router";

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
  const destination = router.buildLocation({
    to: conversationId ? "/messages" : "/dashboard",
    search: { workspaceId: organizationId, conversationId },
  }).href;
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
          <AuthNavLink href="/onboarding">Workspaces</AuthNavLink>
          <SignOutButton destination="/onboarding" />
        </>
      }
    >
      <DesktopInstall destination={destination} browserHref={destination} />
      {invitationRoles(role).length > 0 && (
        <>
          <Separator />
          <InvitationManager organizationId={organizationId} viewerRole={role} />
        </>
      )}
    </AuthFrame>
  );
}
