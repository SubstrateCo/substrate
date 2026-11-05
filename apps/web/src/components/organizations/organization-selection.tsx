import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormMessage } from "@/components/auth/form-message";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreateOrganizationForm } from "./create-organization-form";

export function OrganizationSelection() {
  const organizations = useQuery(organizationsQueryOptions());
  const queryClient = useQueryClient();
  const select = useMutation({
    mutationFn: async (organizationId: string) => {
      unwrap(await authClient.organization.setActive({ organizationId }));
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your workspaces</h1>
        <SignOutButton />
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>Open an existing workspace or create one for your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {organizations.isPending && <p role="status">Loading workspaces…</p>}
          <FormMessage error={organizations.error || select.error} />
          {organizations.isError && (
            <Button variant="outline" onClick={() => void organizations.refetch()}>
              Try again
            </Button>
          )}
          {organizations.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no workspaces yet. Create one below, or open an invitation link from your
              email.
            </p>
          )}
          <div className="grid gap-2">
            {organizations.data?.map((organization) => (
              <Button
                key={organization.id}
                variant="outline"
                className="justify-start"
                disabled={select.isPending}
                onClick={() => select.mutate(organization.id)}
              >
                {organization.name}
              </Button>
            ))}
          </div>
          <Separator />
          <h2 className="font-medium">Create a workspace</h2>
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </main>
  );
}
