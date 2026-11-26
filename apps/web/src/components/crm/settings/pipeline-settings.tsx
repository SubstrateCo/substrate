import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import {
  SettingsCard,
  SettingsFooter,
  SettingsNote,
  SettingsSection,
} from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useCrmMutation } from "@/queries/crm/mutations";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";

type Stage = { id: string; name: string; retired: boolean };
type DraftStage = Extract<CrmWrite, { action: "configureStages" }>["stages"][number] & {
  key: string;
};

export function PipelineSettings({ stages, canEdit }: { stages: Stage[]; canEdit: boolean }) {
  const { organizationId } = useWorkspaceScope();
  const active = stages.filter((stage) => !stage.retired);
  const [draft, setDraft] = useState<DraftStage[] | null>(null);
  const mutation = useCrmMutation(organizationId);
  const rows = draft ?? active.map((stage) => ({ ...stage, key: stage.id }));
  const dirty = draft !== null;
  const invalidName = rows.some((stage) => !stage.name.trim());
  function move(index: number, offset: number) {
    const next = [...rows];
    const [stage] = next.splice(index, 1);
    next.splice(index + offset, 0, stage);
    setDraft(next);
  }
  return (
    <>
      <UnsavedChangesGuard
        dirty={dirty}
        name="CRM pipeline"
        description="Your pipeline changes haven’t been saved."
      />
      <PipelineSection
        footer={
          canEdit && (
            <SettingsFooter
              dirty={dirty}
              pending={mutation.isPending}
              error={invalidName ? "Enter a name for each stage." : undefined}
              onDiscard={() => {
                setDraft(null);
                mutation.reset();
              }}
              onSave={() => {
                if (!invalidName)
                  mutation.mutate(
                    {
                      action: "configureStages",
                      organizationId,
                      stages: rows.map(({ id, name }) => ({ id, name: name.trim() })),
                    },
                    { onSuccess: () => setDraft(null) },
                  );
              }}
            />
          )
        }
      >
        <ol className="max-w-lg space-y-2">
          {rows.map((stage, index) => (
            <PipelineStageRow
              key={stage.key}
              number={index + 1}
              control={
                <Input
                  aria-label={`Stage ${index + 1} name`}
                  value={stage.name}
                  maxLength={100}
                  disabled={!canEdit || mutation.isPending}
                  onChange={(event) =>
                    setDraft(
                      rows.map((row) =>
                        row.key === stage.key ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                />
              }
              actions={
                canEdit && (
                  <RowActions label={`Actions for ${stage.name}`}>
                    <RowAction
                      label={`Move ${stage.name} up`}
                      disabled={index === 0 || mutation.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </RowAction>
                    <RowAction
                      label={`Move ${stage.name} down`}
                      disabled={index === rows.length - 1 || mutation.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </RowAction>
                  </RowActions>
                )
              }
            />
          ))}
        </ol>
        {canEdit && (
          <Button
            className="justify-self-start"
            variant="outline"
            size="sm"
            disabled={rows.length >= 20 || mutation.isPending}
            onClick={() => setDraft([...rows, { key: crypto.randomUUID(), name: "New stage" }])}
          >
            <Plus aria-hidden />
            Add stage
          </Button>
        )}
        {mutation.error && (
          <SettingsNote>
            {actionErrorMessage(
              mutation.error,
              "Couldn’t save the pipeline. Check the stage names and try again.",
            )}
          </SettingsNote>
        )}
      </PipelineSection>
    </>
  );
}

function PipelineStageRow({
  number,
  control,
  actions,
}: {
  number: React.ReactNode;
  control: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="group/row flex min-w-0 items-center gap-2">
      <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{number}</span>
      <div className="min-w-0 flex-1">{control}</div>
      {actions}
    </li>
  );
}

function PipelineSection({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <SettingsSection
      title="Pipeline"
      description="Arrange open stages in sales order. Renaming or reordering keeps deal history."
    >
      <SettingsCard label="CRM pipeline" footer={footer}>
        {children}
      </SettingsCard>
    </SettingsSection>
  );
}

export function PipelineSettingsLoading() {
  return (
    <div role="status" aria-label="Loading pipeline settings">
      <PipelineSection>
        <ol className="max-w-lg space-y-2" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <PipelineStageRow
              key={key}
              number={<SkeletonText width="1rem" />}
              control={<Skeleton className="h-9 flex-1" />}
            />
          ))}
        </ol>
      </PipelineSection>
    </div>
  );
}
