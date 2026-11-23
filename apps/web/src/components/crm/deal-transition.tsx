import type { DealOutcome } from "@substrate/contracts/crm/input";

import { useState } from "react";

import { formText } from "./form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";

export function DealTransition({
  stageId: initialStageId,
  // oxlint-disable-next-line deslop/prefer-literal-union -- Persisted outcomes are strings; normalize unknown values to open.
  outcome: initialOutcome,
  lostReason: initialLostReason,
  stages,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  stageId: string;
  outcome: string;
  lostReason: string | null;
  stages: { value: string; label: string }[];
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (
    stageId: string,
    outcome: DealOutcome,
    lostReason: string | null,
    requestId: string,
  ) => void;
}) {
  const [stageId, setStageId] = useState(initialStageId);
  const [outcome, setOutcome] = useState<DealOutcome>(() => {
    if (initialOutcome === "won" || initialOutcome === "lost") return initialOutcome;
    return "open";
  });
  const [requestId] = useState(() => crypto.randomUUID());
  const [lostReason, setLostReason] = useState(initialLostReason ?? "");
  return (
    <FormDialog
      title="Move deal"
      description="Stage and outcome changes are recorded in this deal’s history. Reopening removes it from current closed-period results."
      saveLabel="Move deal"
      pendingLabel="Moving…"
      nativeValidation
      pending={pending}
      error={error}
      errorDescription="Couldn’t move this deal. It may have changed. Refresh and try again."
      onClose={onClose}
      onSubmit={(form) =>
        onSubmit(
          stageId,
          outcome,
          outcome === "lost" ? formText(form, "lostReason") || null : null,
          requestId,
        )
      }
    >
      <SelectField label="Stage" value={stageId} onChange={setStageId} options={stages} />
      <SelectField
        label="Outcome"
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: "open", label: "Open" },
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
        ]}
      />
      {outcome === "lost" && (
        <NativeField
          id="crm-lost-reason"
          name="lostReason"
          label="Lost reason"
          multiline
          value={lostReason}
          onChange={(event) => setLostReason(event.target.value)}
          maxLength={2000}
        />
      )}
    </FormDialog>
  );
}
