import { useQuery } from "@tanstack/react-query";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { InvitationManager } from "@/components/organizations/invitation-manager";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { FormMessage } from "@/components/auth/form-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Dashboard({ organizationId, name }: { organizationId: string; name: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const member = useQuery(activeMemberQueryOptions(organizationId));
  const isOwner =
    member.data?.organizationId === organizationId && member.data.role.split(",").includes("owner");
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Startup OS</p>
          <OrganizationSwitcher
            organizationId={organizationId}
            name={organization.data?.name || "Workspace"}
          />
        </div>
        <SignOutButton />
      </header>
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome, {name}</h1>
        <p className="text-muted-foreground">Your team's shared workspace.</p>
      </section>
      <FormMessage error={organization.error || member.error} />
      <Card>
        <CardHeader>
          <CardTitle>{organization.data?.name || "Your workspace"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {member.isPending
              ? "Loading your membership…"
              : member.data
                ? `Your role: ${member.data.role}.`
                : "Your membership could not be loaded."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Workspace roles manage the team. Access to individual records is controlled separately.
          </p>
        </CardContent>
      </Card>
      {isOwner && <InvitationManager organizationId={organizationId} />}
    </main>
  );
}
