import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { invitationQueryOptions, unwrap } from "@/queries/organizations/options";
import { AuthFrame } from "@/components/auth/auth-frame";
import { FormMessage } from "@/components/auth/form-message";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";

export function AcceptInvitationScreen({ invitationId }: { invitationId: string }) {
  const invitation = useQuery(invitationQueryOptions(invitationId));
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: async () => {
      const result = unwrap(await authClient.organization.acceptInvitation({ invitationId }));
      unwrap(
        await authClient.organization.setActive({ organizationId: result.member.organizationId }),
      );
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  const expired = invitation.data && new Date(invitation.data.expiresAt).getTime() < Date.now();
  return (
    <AuthFrame title="Join your team" description="Accept your invitation to enter the workspace.">
      {invitation.isPending && <p role="status">Loading invitation…</p>}
      <FormMessage error={invitation.error || accept.error} />
      {invitation.isError && (
        <p className="text-sm text-muted-foreground">
          The invitation may have expired, been canceled, or belong to another email address. Sign
          in with the invited email or ask the owner for a new invitation.
        </p>
      )}
      {invitation.data && (
        <div className="space-y-4">
          <p>
            Join <strong>{invitation.data.organizationName}</strong> as{" "}
            <strong>{invitation.data.role}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">Invited email: {invitation.data.email}</p>
          {expired || invitation.data.status !== "pending" ? (
            <FormMessage message="This invitation is no longer available. Ask the owner for a new invitation." />
          ) : (
            <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
              {accept.isPending ? "Joining…" : "Accept invitation"}
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <a className="text-sm underline" href="/organizations">
          Your workspaces
        </a>
        <SignOutButton />
      </div>
    </AuthFrame>
  );
}
