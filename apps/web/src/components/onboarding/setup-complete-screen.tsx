import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { InvitationManager } from "@/components/organizations/invitations/invitation-manager";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

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
  const search = new URLSearchParams({ workspaceId: organizationId });
  if (conversationId) search.set("conversationId", conversationId);
  const destination = `/dashboard?${search}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pt-20 pb-8 sm:px-6">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Your workspace is ready</h1>
          <CardDescription>
            You’re a member of {name}. You can finish setup before installing the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DesktopInstall destination={destination} />
        </CardContent>
      </Card>
      {canInvite && (
        <Card>
          <CardContent>
            <InvitationManager organizationId={organizationId} />
          </CardContent>
        </Card>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-4">
        <a className="text-sm underline" href="/onboarding">
          Choose another workspace
        </a>
        <SignOutButton destination="/onboarding" />
      </footer>
    </main>
  );
}
