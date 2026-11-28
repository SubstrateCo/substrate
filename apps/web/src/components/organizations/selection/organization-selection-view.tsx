import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { ErrorState } from "../../feedback/error-state";
import { SkeletonText } from "../../feedback/skeleton-text";
import { useFocusAfterRender } from "../../feedback/use-focus-after-render";
import { WorkspaceTile } from "../workspace-tile";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Heading } from "@/components/ui/heading";
import { Item } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import type { ResourceState } from "@/lib/resource-state";
import { ChevronRight, Plus } from "lucide-react";

type Workspace = { id: string; name: string; logo?: string | null };

export function OrganizationSelection({
  workspaces,
  invitationsPending = false,
  openingId,
  onRetry,
  onSelect,
  signOut,
  createForm,
  invitations,
  hasInvitations = false,
}: {
  workspaces: ResourceState<Workspace[]>;
  invitationsPending?: boolean;
  openingId?: string;
  onRetry: () => void;
  onSelect: (id: string) => void;
  signOut: ReactNode;
  createForm: ReactNode;
  invitations?: ReactNode;
  hasInvitations?: boolean;
}) {
  const { data, error } = workspaces;
  const loading = workspaces.status === "loading" || invitationsPending;
  const retryOrigin = useRef<Element | null>(null);
  const firstChoice = useRef<HTMLButtonElement | null>(null);
  const creationHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const origin = retryOrigin.current;
    if (!origin || loading || error) return;
    if (!origin.isConnected && document.activeElement === document.body) {
      (firstChoice.current ?? creationHeading.current)?.focus();
    }
    retryOrigin.current = null;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Move focus once a retried load has rendered its result.
  }, [loading, error, data]);

  const listed = data ?? [];
  const collapsible = listed.length > 0 || hasInvitations;
  const description =
    hasInvitations && !loading && listed.length === 0
      ? "Join a workspace you were invited to, or create one for your team."
      : "Open a workspace you belong to, or create one for your team.";

  return (
    <AuthFrame title="Choose a workspace" description={description} actions={signOut}>
      {invitations}
      {workspaces.status === "loading" && <WorkspaceListLoading />}
      {error && (
        <ErrorState
          variant="compact"
          title="Couldn’t load workspaces"
          description="Your workspace list is unavailable. Try again, or create a workspace below."
          onRetry={() => {
            retryOrigin.current = document.activeElement;
            onRetry();
          }}
        />
      )}
      {listed.length > 0 && (
        <WorkspaceList
          organizations={listed}
          openingId={openingId}
          firstChoiceRef={firstChoice}
          onSelect={onSelect}
        />
      )}
      <CreateWorkspace
        collapsible={collapsible}
        loading={loading}
        headingRef={creationHeading}
        createForm={createForm}
      />
    </AuthFrame>
  );
}

function WorkspaceListLoading() {
  return (
    <div role="status" aria-label="Loading workspaces">
      <ul aria-hidden="true" className="-mx-2.5 max-h-72 space-y-0.5 overflow-y-auto">
        {[0, 1].map((key) => (
          <li key={key}>
            <Item size="xs">
              <WorkspaceChoiceContent />
            </Item>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkspaceList({
  organizations,
  openingId,
  firstChoiceRef,
  onSelect,
}: {
  organizations: Workspace[];
  openingId?: string;
  firstChoiceRef: RefObject<HTMLButtonElement | null>;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-2" aria-labelledby="your-workspaces-title">
      <Heading level={2} variant="label" id="your-workspaces-title">
        Your workspaces
      </Heading>
      <ul
        aria-labelledby="your-workspaces-title"
        className="-mx-2.5 max-h-72 space-y-0.5 overflow-y-auto"
      >
        {organizations.map((organization, index) => {
          const opening = openingId === organization.id;
          return (
            <li key={organization.id}>
              <Item asChild size="xs">
                <button
                  ref={index === 0 ? firstChoiceRef : undefined}
                  type="button"
                  className="flex-nowrap text-left font-medium hover:bg-row-hover disabled:pointer-events-none disabled:opacity-60 aria-busy:opacity-100"
                  disabled={openingId !== undefined}
                  aria-busy={opening}
                  onClick={() => onSelect(organization.id)}
                >
                  <WorkspaceChoiceContent
                    name={organization.name}
                    logo={organization.logo}
                    opening={opening}
                  />
                </button>
              </Item>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CreateWorkspace({
  collapsible,
  loading,
  headingRef,
  createForm,
}: {
  collapsible: boolean;
  loading: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  createForm: ReactNode;
}) {
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const [creating, setCreating] = useState(false);
  const focusAfterRender = useFocusAfterRender();
  const showCreate = creating || (!loading && !collapsible);
  return (
    <Collapsible
      open={showCreate}
      onOpenChange={(open) => {
        setCreating(open);
        if (open) focusAfterRender(() => document.getElementById("organization-name"));
      }}
    >
      {!showCreate && (
        <CollapsibleTrigger asChild>
          <Button
            ref={createTrigger}
            type="button"
            variant="disclosure"
            className="-ml-2 self-start"
          >
            <Plus aria-hidden="true" />
            Create a workspace
          </Button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        {collapsible && <Separator />}
        <section className="space-y-4 pt-4" aria-labelledby="create-workspace-title">
          <div className="flex items-center justify-between gap-2">
            <Heading
              level={2}
              id="create-workspace-title"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              Create a workspace
            </Heading>
            {collapsible && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-mr-2.5"
                onClick={() => {
                  setCreating(false);
                  focusAfterRender(() => createTrigger.current);
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
  );
}

function WorkspaceChoiceContent({
  name,
  logo,
  opening,
}: {
  name?: string;
  logo?: string | null;
  opening?: boolean;
}) {
  return (
    <>
      <WorkspaceTile name={name} logo={logo} opening={opening} />
      <span className="min-w-0 flex-1 wrap-anywhere">{name ?? <SkeletonText width="9rem" />}</span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/item:opacity-100"
      />
    </>
  );
}
