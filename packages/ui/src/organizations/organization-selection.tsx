import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { Button } from "../primitives/button";
import { Separator } from "../primitives/separator";
import { FormMessage } from "../auth/form-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { ContentNotice } from "../feedback/content-notice";
import { Spinner } from "../primitives/spinner";

export function OrganizationSelection({
  organizations,
  loading = false,
  pending = false,
  error,
  loadError,
  onRetry,
  onSelect,
  signOut,
  createForm,
}: {
  organizations?: { id: string; name: string }[];
  loading?: boolean;
  pending?: boolean;
  error?: Error | null;
  loadError?: Error | null;
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
        <CardContent>
          <div className="space-y-4">
            <FormMessage
              error={error}
              errorDescription="We couldn’t open this workspace. Try selecting it again."
            />
            <div className="min-h-36 space-y-3">
              {loading && <LoadingState label="Loading workspaces…" rows={2} />}
              {loadError && (
                <ErrorState
                  title="Couldn’t load workspaces"
                  description="Your workspace list is unavailable. Try again, or create a workspace below."
                  onRetry={onRetry}
                />
              )}
              {!loading && !loadError && organizations?.length === 0 && (
                <ContentNotice
                  title="No workspaces yet"
                  description="Create one below, or open an invitation link from your email."
                />
              )}
              <div className="grid gap-2">
                {!loading &&
                  (!loadError || organizations !== undefined) &&
                  organizations?.map((organization) => (
                    <Button
                      key={organization.id}
                      variant="outline"
                      size="selection"
                      className="justify-start whitespace-normal text-left"
                      disabled={pending}
                      aria-busy={pending}
                      onClick={() => onSelect(organization.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
                      >
                        {pending ? (
                          <Spinner aria-hidden="true" role="presentation" />
                        ) : (
                          organization.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 wrap-break-word">{organization.name}</span>
                    </Button>
                  ))}
              </div>
            </div>
            <Separator />
            <h2 className="font-medium">Create a workspace</h2>
            {createForm}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
