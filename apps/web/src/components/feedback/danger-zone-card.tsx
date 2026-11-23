import { useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { useFocusReturn } from "./use-focus-return";
import { SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Trash2, type LucideIcon } from "lucide-react";

/**
 * The danger zone of a settings area: a `destructive` card with one quiet red button that asks
 * first. Delete is the default; archive passes its own icon, labels, and `destructive={false}`,
 * because it can be undone.
 */
export function DangerZoneCard({
  title,
  actionLabel,
  icon: Icon = Trash2,
  description,
  confirmTitle,
  confirmDescription,
  confirmLabel = title,
  pendingLabel = "Deleting.",
  destructive = true,
  pending,
  error,
  errorDescription,
  onConfirm,
  onReset,
  onRestoreFocus,
}: {
  title: string;
  /** Names the record for assistive technology when the visible title is generic. */
  actionLabel?: string;
  icon?: LucideIcon;
  description: ReactNode;
  confirmTitle: string;
  confirmDescription: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  /** A solid red confirm. False for an action that can be undone, such as archive. */
  destructive?: boolean;
  pending: boolean;
  error?: Error | string | null;
  errorDescription: string;
  /** Starts the mutation. Call `onDone` once it succeeds. */
  onConfirm: (onDone: () => void) => void;
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
          <Icon aria-hidden="true" />
          {title}
        </Button>
      </SettingsCard>
      {confirming && (
        <ConfirmDialog
          title={confirmTitle}
          description={confirmDescription}
          destructive={destructive}
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
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
          onConfirm={() => onConfirm(() => setConfirming(false))}
        />
      )}
    </>
  );
}
