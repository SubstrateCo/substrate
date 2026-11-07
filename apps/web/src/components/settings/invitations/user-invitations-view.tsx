import type { ComponentProps } from "react";

import { UserInvitationsTable } from "./user-invitations-table";

export function UserInvitations(props: ComponentProps<typeof UserInvitationsTable>) {
  return (
    <section className="space-y-6" aria-labelledby="user-invitations-title">
      <header className="space-y-2">
        <h2 id="user-invitations-title" className="text-lg font-semibold">
          Your invitations
        </h2>
        <p className="text-sm text-muted-foreground">
          Pending organization invitations sent to your account's email address.
        </p>
      </header>
      <UserInvitationsTable {...props} />
    </section>
  );
}
