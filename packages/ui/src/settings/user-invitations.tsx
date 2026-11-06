import type { ComponentProps } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { UserInvitationsTable } from "./user-invitations-table";

export function UserInvitations(props: ComponentProps<typeof UserInvitationsTable>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your invitations</CardTitle>
        <CardDescription>
          Pending organization invitations sent to your account's email address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UserInvitationsTable {...props} />
      </CardContent>
    </Card>
  );
}
