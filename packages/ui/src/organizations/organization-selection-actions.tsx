import type { ReactNode } from "react";

export function OrganizationSelectionActions({
  invitationsHref,
  signOut,
}: {
  invitationsHref: string;
  signOut: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <a href={invitationsHref} className="text-sm underline">
        Your invitations
      </a>
      {signOut}
    </div>
  );
}
