import { useEffect, useRef, type ReactNode } from "react";

import { FormMessage } from "../auth/form-message";
import { ContentNotice } from "../feedback/content-notice";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { Separator } from "../primitives/separator";
import { OrganizationSelectionItem } from "./organization-selection-item";

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
  const retryOrigin = useRef<Element | null>(null);
  const firstChoice = useRef<HTMLButtonElement | null>(null);
  const actionOrigin = useRef<HTMLButtonElement | null>(null);
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
    <main className="fixed inset-0 mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
        {signOut}
      </header>
      <Card className="min-h-0 overflow-y-auto">
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>Open an existing workspace or create one for your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <FormMessage
              floating
              floatingPlacement="below-header"
              onDismiss={() => {
                const target = actionOrigin.current?.isConnected
                  ? actionOrigin.current
                  : firstChoice.current;
                target?.focus();
              }}
              error={error}
              errorDescription="We couldn’t open this workspace. Try selecting it again."
            />
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
                    <OrganizationSelectionItem
                      key={organization.id}
                      buttonRef={index === 0 ? firstChoice : undefined}
                      name={organization.name}
                      pending={pending}
                      onSelect={() => {
                        const active = document.activeElement;
                        actionOrigin.current = active instanceof HTMLButtonElement ? active : null;
                        onSelect(organization.id);
                      }}
                    />
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
