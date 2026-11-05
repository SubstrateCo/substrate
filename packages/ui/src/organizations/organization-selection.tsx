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
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-20 sm:px-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
        {signOut}
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>Open an existing workspace or create one for your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormMessage error={failed ? null : error} floating />
          <div className="min-h-36 space-y-3">
            {loading && (
              <div role="status" className="space-y-3">
                <span className="sr-only">Loading workspaces…</span>
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    aria-hidden="true"
                    className="h-14 rounded-lg border bg-muted motion-safe:animate-pulse"
                  />
                ))}
              </div>
            )}
            {failed && <FormMessage error={error} />}
            {failed && (
              <Button variant="outline" onClick={onRetry}>
                Try again
              </Button>
            )}
            {!loading && !failed && organizations?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You have no workspaces yet. Create one below, or open an invitation link from your
                email.
              </p>
            )}
            <div className="grid gap-2">
              {!loading &&
                !failed &&
                organizations?.map((organization) => (
                  <Button
                    key={organization.id}
                    variant="outline"
                    className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left"
                    disabled={pending}
                    onClick={() => onSelect(organization.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
                    >
                      {organization.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 break-words">{organization.name}</span>
                  </Button>
                ))}
            </div>
          </div>
          <Separator />
          <h2 className="font-medium">Create a workspace</h2>
          {createForm}
        </CardContent>
      </Card>
    </main>
  );
}
