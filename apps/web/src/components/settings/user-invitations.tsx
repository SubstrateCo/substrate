import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@startup-os/ui/primitives/card";
import { userInvitationsQueryOptions } from "@/queries/organizations/options";
import { UserInvitationsTable } from "./user-invitations-table";

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
        <UserInvitationsTable
          invitations={invitations.data}
          loading={invitations.isPending}
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
        />
      </CardContent>
    </Card>
  );
}
