import { useRouter } from "@tanstack/react-router";

import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthNavLink } from "@/components/auth/auth-link";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { Separator } from "@/components/ui/separator";

export function SetupCompleteScreen({
  organizationId,
  name,
  canInvite,
  conversationId,
}: {
  organizationId: string;
  name: string;
  canInvite: boolean;
  conversationId?: string;
}) {
  const router = useRouter();
  const destination = router.buildLocation({
    to: "/dashboard",
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
      {canInvite && (
        <>
          <Separator />
          <InvitationManager organizationId={organizationId} />
        </>
      )}
    </AuthFrame>
  );
}
