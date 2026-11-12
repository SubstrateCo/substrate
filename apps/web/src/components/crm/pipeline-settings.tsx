import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
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
import { useCrmMutation } from "@/queries/crm/mutations";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";

type Stage = { id: string; name: string; retired: boolean };
type DraftStage = { id?: string; name: string; key: string };

export function PipelineSettings({
  organizationId,
  stages,
  canEdit,
}: {
  organizationId: string;
  stages: Stage[];
  canEdit: boolean;
}) {
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
    <SettingsSection
      title="Pipeline"
      description="One pipeline with stable open stages. Won and Lost remain separate outcomes."
    >
      <UnsavedChangesGuard
        dirty={dirty}
        name="CRM pipeline"
        description="Your pipeline changes haven’t been saved."
      />
      <SettingsCard
        title="Open stages"
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
        <ol className="space-y-2">
          {rows.map((stage, index) => (
            <li key={stage.key} className="group/row flex items-center gap-2">
              <span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
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
              {canEdit && (
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
              )}
            </li>
          ))}
        </ol>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length >= 20 || mutation.isPending}
            onClick={() => setDraft([...rows, { key: crypto.randomUUID(), name: "New stage" }])}
          >
            <Plus aria-hidden />
            Add stage
          </Button>
        )}
        <SettingsNote>
          Rename or reorder stages without changing their IDs or deal history. Move existing deals
          before retiring stages. Closing a deal uses its Won or Lost outcome.
        </SettingsNote>
        {mutation.error && (
          <SettingsNote>
            {actionErrorMessage(
              mutation.error,
              "Couldn’t save the pipeline. Check the stage names and try again.",
            )}
          </SettingsNote>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
