import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@startup-os/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@startup-os/ui/primitives/card";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { userInvitationsQueryOptions } from "@/queries/organizations/options";

export function UserInvitations() {
  const invitations = useQuery(userInvitationsQueryOptions());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your invitations</CardTitle>
        <CardDescription>
          Pending organization invitations sent to your account’s email address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invitations.isPending && <p role="status">Loading your invitations…</p>}
        {invitations.isError && (
          <div className="space-y-3">
            <FormMessage error={invitations.error} />
            <Button variant="outline" onClick={() => void invitations.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!invitations.isError && invitations.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">You have no pending invitations.</p>
        )}
        {!invitations.isError && (
          <ul className="space-y-3">
            {invitations.data?.map((invitation) => {
              const expired = new Date(invitation.expiresAt).getTime() <= Date.now();
              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0">
                    <p className="wrap-break-word font-medium">
                      {invitation.organizationName || "Organization"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {invitation.role} · {expired ? "expired" : "pending"}
                    </p>
                  </div>
                  {!expired && (
                    <Button asChild variant="outline">
                      <Link
                        to="/accept-invitation/$invitationId"
                        params={{ invitationId: invitation.id }}
                      >
                        Review invitation
                      </Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
