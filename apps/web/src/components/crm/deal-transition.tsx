import type { DealOutcome } from "@substrate/contracts/crm/input";

import { useState } from "react";

import { CrmSelect } from "./crm-select";
import { formText } from "./form-text";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DealTransition({
  stageId: initialStageId,
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move deal</DialogTitle>
          <DialogDescription>
            Stage and outcome changes are recorded in this deal’s history. Reopening removes it from
            current closed-period results.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={pending}
          onSubmit={(form) =>
            onSubmit(
              stageId,
              outcome,
              outcome === "lost" ? formText(form, "lostReason") || null : null,
              requestId,
            )
          }
        >
          <DialogBody>
            <CrmSelect label="Stage" value={stageId} onValueChange={setStageId} options={stages} />
            <CrmSelect
              label="Outcome"
              value={outcome}
              onValueChange={(next) => {
                if (next === "open" || next === "won" || next === "lost") setOutcome(next);
              }}
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
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                maxLength={2000}
              />
            )}
            <FormMessage
              error={error}
              errorDescription="Couldn’t move this deal. It may have changed. Refresh and try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={pending} pendingLabel="Moving…">
              Move deal
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}
