import type { DealOutcome } from "@substrate/contracts/crm/input";

import { useState } from "react";

import { outcomeLabels, newRequestId } from "@/features/records/format";
import type { Stage } from "@/features/records/requests";
import { SelectField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";

const outcomes: DealOutcome[] = ["open", "won", "lost"];

export function DealTransitionForm({
  stages,
  stageId,
  outcome,
  lostReason,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  stages: Stage[];
  stageId: string;
  outcome: DealOutcome;
  lostReason: string | null;
  pending: boolean;
  error: Error | null;
  onSubmit: (value: {
    stageId: string;
    outcome: DealOutcome;
    lostReason: string | null;
    requestId: string;
  }) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState(stageId);
  const [next, setNext] = useState<DealOutcome>(outcome);
  const [reason, setReason] = useState(lostReason ?? "");
  const [requestId] = useState(newRequestId);
  const choices = stages
    .filter((row) => !row.retired || row.id === stageId)
    .map((row) => ({ value: row.id, label: row.retired ? `${row.name} (retired)` : row.name }));
  return (
    <FormSheet
      title="Move deal"
      saveLabel="Move"
      dirty={stage !== stageId || next !== outcome || reason !== (lostReason ?? "")}
      pending={pending}
      canSave={
        stage !== stageId || next !== outcome || (next === "lost" && reason !== (lostReason ?? ""))
      }
      error={error}
      onClose={onClose}
      onSave={() =>
        onSubmit({
          stageId: stage,
          outcome: next,
          lostReason: next === "lost" ? reason.trim() || null : null,
          requestId,
        })
      }
    >
      <SelectField label="Stage" value={stage} onChange={setStage} choices={choices} />
      <SelectField
        label="Outcome"
        value={next}
        onChange={setNext}
        choices={outcomes.map((value) => ({ value, label: outcomeLabels[value] }))}
      />
      {next === "lost" ? (
        <TextField
          label="Lost reason"
          value={reason}
          onChange={setReason}
          multiline
          maxLength={2000}
        />
      ) : null}
    </FormSheet>
  );
}
