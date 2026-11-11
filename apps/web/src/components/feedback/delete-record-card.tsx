import { useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { useFocusReturn } from "./use-focus-return";
import { SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteRecordCard({
  title,
  actionLabel,
  description,
  confirmTitle,
  confirmDescription,
  pending,
  error,
  errorDescription,
  onDelete,
  onReset,
  onRestoreFocus,
}: {
  title: string;
  /** Names the record for assistive technology when the visible title is generic. */
  actionLabel?: string;
  description: ReactNode;
  confirmTitle: string;
  confirmDescription: ReactNode;
  pending: boolean;
  error?: Error | string | null;
  errorDescription: string;
  /** Starts the delete mutation. Call `onDeleted` once the record is gone. */
  onDelete: (onDeleted: () => void) => void;
  onReset: () => void;
  onRestoreFocus?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const focusReturn = useFocusReturn(button);
  return (
    <>
      <SettingsCard tone="destructive" title={title} description={description}>
        <Button
          ref={button}
          aria-label={actionLabel}
          className="w-fit"
          variant="destructive-ghost"
          disabled={pending}
          onClick={() => {
            focusReturn.remember();
            onReset();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {title}
        </Button>
      </SettingsCard>
      {confirming && (
        <ConfirmDialog
          title={confirmTitle}
          description={confirmDescription}
          destructive
          confirmLabel={title}
          pendingLabel="Deleting…"
          pending={pending}
          error={error}
          errorDescription={errorDescription}
          onRestoreFocus={() => {
            if (button.current?.isConnected) focusReturn.restore();
            else onRestoreFocus?.();
          }}
          onClose={() => {
            setConfirming(false);
            onReset();
          }}
          onConfirm={() => onDelete(() => setConfirming(false))}
        />
      )}
    </>
  );
}
