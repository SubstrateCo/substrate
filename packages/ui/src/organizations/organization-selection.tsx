import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { Button } from "../primitives/button";
import { Separator } from "../primitives/separator";
import { FormMessage } from "../auth/form-message";

export function OrganizationSelection({
  organizations,
  loading = false,
  pending = false,
  error,
  failed = false,
  onRetry,
  onSelect,
  signOut,
  createForm,
}: {
  organizations?: { id: string; name: string }[];
  loading?: boolean;
  pending?: boolean;
  error?: Error | null;
  failed?: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
  signOut: ReactNode;
  createForm: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your workspaces</h1>
        {signOut}
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>Open an existing workspace or create one for your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p role="status">Loading workspaces…</p>}
          <FormMessage error={error} />
          {failed && (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
          {organizations?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no workspaces yet. Create one below, or open an invitation link from your
              email.
            </p>
          )}
          <div className="grid gap-2">
            {organizations?.map((organization) => (
              <Button
                key={organization.id}
                variant="outline"
                className="justify-start"
                disabled={pending}
                onClick={() => onSelect(organization.id)}
              >
                {organization.name}
              </Button>
            ))}
          </div>
          <Separator />
          <h2 className="font-medium">Create a workspace</h2>
          {createForm}
        </CardContent>
      </Card>
    </main>
  );
}
