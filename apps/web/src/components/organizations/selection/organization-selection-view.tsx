import { useEffect, useRef, useState, type ReactNode } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { AuthNavLink } from "../../auth/auth-link";
import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { Item } from "../../ui/item";
import { Separator } from "../../ui/separator";
import { Spinner } from "../../ui/spinner";
import { initials } from "@/lib/people/initials";
import { Building2, ChevronRight, Plus } from "lucide-react";

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
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const origin = retryOrigin.current;
    if (!origin || loading || loadError) return;
    if (!origin.isConnected && document.activeElement === document.body) {
      (firstChoice.current ?? creationHeading.current)?.focus();
    }
    retryOrigin.current = null;
  }, [loading, loadError, organizations]);

  const listed =
    !isAccessFailure(loadError) && (!loadError || organizations !== undefined)
      ? (organizations ?? [])
      : [];
  // With workspaces to open, creating another is a secondary, collapsed step.
  const showCreate = creating || (!loading && listed.length === 0);

  return (
    <AuthFrame
      title="Choose a workspace"
      description="Open a workspace you belong to, or create one for your team."
      actions={
        <>
          <AuthNavLink href="/settings/user/invitations">Your invitations</AuthNavLink>
          {signOut}
        </>
      }
    >
      {loading && !organizations?.length && !isAccessFailure(loadError) && (
        <LoadingState label="Loading workspaces." rows={2} />
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
          icon={Building2}
          title="No workspaces yet"
          description="Create one below, or open an invitation link from your email."
        />
      )}
      {listed.length > 0 && (
        <ul aria-label="Your workspaces" className="-mx-2.5 max-h-72 space-y-0.5 overflow-y-auto">
          {listed.map((organization, index) => {
            const opening = pending && selectedId === organization.id;
            return (
              <li key={organization.id}>
                <Item asChild size="xs">
                  <button
                    ref={index === 0 ? firstChoice : undefined}
                    type="button"
                    className="flex-nowrap text-left font-medium hover:bg-row-hover disabled:pointer-events-none disabled:opacity-60 aria-busy:opacity-100"
                    disabled={pending}
                    aria-busy={opening}
                    onClick={() => {
                      setSelectedId(organization.id);
                      onSelect(organization.id);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
                    >
                      {opening ? (
                        <Spinner aria-hidden="true" role="presentation" />
                      ) : (
                        initials(organization.name)
                      )}
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere">{organization.name}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/item:opacity-100"
                    />
                  </button>
                </Item>
              </li>
            );
          })}
        </ul>
      )}
      <Collapsible
        open={showCreate}
        onOpenChange={(open) => {
          setCreating(open);
          if (open)
            requestAnimationFrame(() => document.getElementById("organization-name")?.focus());
        }}
      >
        {!showCreate && (
          <CollapsibleTrigger asChild>
            <Button
              ref={createTrigger}
              type="button"
              variant="disclosure"
              className="-ml-2.5 self-start"
            >
              <Plus aria-hidden="true" />
              Create a workspace
            </Button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          {listed.length > 0 && <Separator />}
          <section className="space-y-4 pt-4" aria-labelledby="create-workspace-title">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="create-workspace-title"
                ref={creationHeading}
                tabIndex={-1}
                className="text-sm font-semibold outline-none"
              >
                Create a workspace
              </h2>
              {listed.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreating(false);
                    requestAnimationFrame(() => createTrigger.current?.focus());
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            {createForm}
          </section>
        </CollapsibleContent>
      </Collapsible>
    </AuthFrame>
  );
}
