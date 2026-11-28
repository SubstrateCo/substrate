import type { HarnessKind, SkillPackages } from "@substrate/contracts/harness-runtime";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useState } from "react";

import { ConfigurationList } from "./configuration-page";
import { SkillCatalogBrowser } from "./skill-catalog-browser";
import { SkillUpdates } from "./skill-updates";
import type { SkillCatalogView } from "./skills-section";
import { SkillSearchPaused } from "@/api/agents/skill-catalog";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { GroupTitle } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  skillPackageController,
  skillSearchOptions,
  skillSourceOptions,
  useSkillPackageMutations,
  useSkillSearchInput,
} from "@/queries/agents/skill-catalog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function CatalogSkills({
  userId,
  organizationId,
  agentId,
  harness,
  available,
  packages,
  view,
  onBrowse,
}: {
  userId: string;
  organizationId: string;
  agentId?: string;
  harness: HarnessKind;
  available: boolean;
  packages: UseQueryResult<SkillPackages>;
  view: SkillCatalogView;
  onBrowse: () => void;
}) {
  const controller = skillPackageController(agentId, harness, available);
  const mutations = useSkillPackageMutations(
    userId,
    organizationId,
    agentId ?? "",
    harness,
    controller,
  );
  const [query, setQuery] = useState("");
  const debounced = useSkillSearchInput(query);
  const search = useQuery({
    ...skillSearchOptions(userId, debounced),
    enabled: view === "discover",
  });
  const [selected, setSelected] = useState<{ source: string; name?: string } | null>(null);
  const preview = useQuery({
    ...skillSourceOptions(
      userId,
      organizationId,
      agentId ?? "",
      selected?.source ?? "",
      controller,
    ),
    enabled: view === "discover" && !!selected && !!controller,
  });
  const [removing, setRemoving] = useState<string | null>(null);
  const installed = packages.data?.skills ?? [];
  const busy =
    mutations.install.isPending || mutations.remove.isPending || mutations.update.isPending;
  let error: Error | null = null;
  if (view === "discover") error = mutations.install.error;
  if (view === "updates") error = mutations.update.error || mutations.frequency.error;
  let searchError: string | null = null;
  if (search.error instanceof SkillSearchPaused)
    searchError = "Search is paused to respect rate limits. Try again shortly.";
  else if (search.error)
    searchError = actionErrorMessage(
      search.error,
      "Try again later, or import a repository below.",
    );
  return (
    <div className="grid min-w-0 gap-6">
      {view === "installed" && (
        <section aria-label="Catalog skills" className="grid min-w-0 gap-4">
          <GroupTitle
            title="Catalog skills"
            description="Added from skills.sh."
            actions={
              <Button size="sm" onClick={onBrowse}>
                <Plus /> Add skill
              </Button>
            }
          />
          {available && packages.isPending && (
            <ContentNotice variant="inline" title="Reading installed skills…" />
          )}
          {packages.isError && (
            <ContentNotice
              variant="inline"
              tone="error"
              title="Could not read catalog skills."
              action={
                <Button variant="ghost" size="sm" onClick={() => void packages.refetch()}>
                  Try again
                </Button>
              }
            />
          )}
          {!packages.isError && installed.length > 0 && (
            <ConfigurationList label="Installed catalog skills">
              {installed.map((skill) => (
                <li key={skill.name}>
                  <Item className="group/row">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="wrap-anywhere">{skill.name}</ItemTitle>
                      <ItemDescription className="wrap-anywhere">
                        {skill.description}
                      </ItemDescription>
                      <p className="text-xs wrap-anywhere text-muted-foreground">{skill.source}</p>
                    </ItemContent>
                    <ItemActions>
                      <RowActions label={`Actions for ${skill.name}`}>
                        <RowAction
                          destructive
                          label={`Remove ${skill.name}`}
                          disabled={busy || !available}
                          onClick={() => setRemoving(skill.name)}
                        >
                          <Trash2 />
                        </RowAction>
                      </RowActions>
                    </ItemActions>
                  </Item>
                </li>
              ))}
            </ConfigurationList>
          )}
          {!packages.isError && !(available && packages.isPending) && installed.length === 0 && (
            <ContentNotice
              variant="inline"
              title={
                available
                  ? "No catalog skills added yet."
                  : "Open the home desktop to see installed skills."
              }
            />
          )}
        </section>
      )}
      {view === "updates" && (
        <SkillUpdates
          state={packages.data?.updates}
          available={available}
          loading={packages.isPending}
          busy={busy}
          saving={mutations.frequency.isPending}
          updating={mutations.update.isPending}
          hasSkills={installed.length > 0}
          onFrequency={(value) => mutations.frequency.mutate(value)}
          onUpdate={() =>
            mutations.update.mutate(undefined, {
              onSuccess: () => toast.success("Skills updated."),
            })
          }
          onRetry={() => void packages.refetch()}
        />
      )}
      {view === "discover" && (
        <SkillCatalogBrowser
          query={query}
          onQuery={setQuery}
          results={search.data?.skills ?? []}
          searching={query.trim().length >= 2 && (query.trim() !== debounced || search.isFetching)}
          searchError={searchError}
          selected={selected}
          onSelect={(value) => {
            setSelected(value);
            mutations.install.reset();
          }}
          onBack={() => {
            setSelected(null);
            mutations.install.reset();
          }}
          preview={preview.data}
          previewPending={preview.isFetching}
          previewError={
            preview.error ? "Could not read this repository. Check the name and try again." : null
          }
          available={available}
          installed={installed.map((skill) => skill.name)}
          installing={mutations.install.isPending ? mutations.install.variables.name : null}
          onInstall={(source, name) =>
            mutations.install.mutate(
              { source, name },
              {
                onSuccess: () => toast.success(`${name} added.`),
              },
            )
          }
        />
      )}
      {error && (
        <ContentNotice
          variant="inline"
          tone="error"
          title="Could not complete this change. Make sure the agent is idle and try again."
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing}?`}
          description="This removes the catalog skill and stops updates for it on this agent. Your custom skills are not changed."
          confirmLabel="Remove skill"
          destructive
          pending={mutations.remove.isPending}
          error={mutations.remove.error}
          errorDescription="Could not remove this skill. Wait until the agent is idle and try again."
          onClose={() => {
            setRemoving(null);
            mutations.remove.reset();
          }}
          onConfirm={() =>
            mutations.remove.mutate(removing, {
              onSuccess: () => {
                setRemoving(null);
                toast.success("Skill removed.");
              },
            })
          }
        />
      )}
    </div>
  );
}
