import { useEffect, useRef, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Separator } from "../../ui/separator";
import { Spinner } from "../../ui/spinner";
import { initials } from "@/lib/people/initials";

export function OrganizationSelection({
  organizations,
  loading = false,
  pending = false,
  loadError,
  onRetry,
  onSelect,
  signOut,
  createForm,
}: {
  organizations?: { id: string; name: string }[];
  loading?: boolean;
  pending?: boolean;
  loadError?: Error | null;
  onRetry: () => void;
  onSelect: (id: string) => void;
  signOut: ReactNode;
  createForm: ReactNode;
}) {
  const retryOrigin = useRef<Element | null>(null);
  const firstChoice = useRef<HTMLButtonElement | null>(null);
  const creationHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const origin = retryOrigin.current;
    if (!origin || loading || loadError) return;
    if (!origin.isConnected && document.activeElement === document.body) {
      (firstChoice.current ?? creationHeading.current)?.focus();
    }
    retryOrigin.current = null;
  }, [loading, loadError, organizations]);
  return (
    <main className="fixed inset-0 mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-20 pb-6 sm:px-6 sm:pt-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/settings/user/invitations" className="text-sm underline">
            Your invitations
          </a>
          {signOut}
        </div>
      </header>
      <Card className="min-h-0 overflow-y-auto">
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>Open an existing workspace or create one for your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-44 space-y-3 overflow-y-auto">
              {loading && !organizations?.length && !isAccessFailure(loadError) && (
                <LoadingState label="Loading workspaces…" rows={2} />
              )}
              {loadError && (
                <ErrorState
                  compact
                  title="Couldn’t load workspaces"
                  description="Your workspace list is unavailable. Try again, or create a workspace below."
                  onRetry={() => {
                    retryOrigin.current = document.activeElement;
                    onRetry();
                  }}
                />
              )}
              {!loading && !loadError && organizations?.length === 0 && (
                <ContentNotice
                  title="No workspaces yet"
                  description="Create one below, or open an invitation link from your email."
                />
              )}
              <div className="grid gap-2">
                {!isAccessFailure(loadError) &&
                  (!loadError || organizations !== undefined) &&
                  organizations?.map((organization, index) => (
                    <Button
                      key={organization.id}
                      ref={index === 0 ? firstChoice : undefined}
                      variant="outline"
                      size="selection"
                      className="max-w-full min-w-0 justify-start text-left whitespace-normal"
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
                          initials(organization.name)
                        )}
                      </span>
                      <span className="min-w-0 wrap-anywhere">{organization.name}</span>
                    </Button>
                  ))}
              </div>
            </div>
            <Separator />
            <h2 ref={creationHeading} tabIndex={-1} className="font-medium">
              Create a workspace
            </h2>
            {createForm}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
