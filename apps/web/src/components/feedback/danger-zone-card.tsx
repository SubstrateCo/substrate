import { useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { useFocusReturn } from "./use-focus-return";
import { SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Trash2, type LucideIcon } from "lucide-react";

export function DangerZoneCard({
  title,
  actionLabel,
  icon: Icon = Trash2,
  description,
  confirmTitle,
  confirmDescription,
  confirmLabel = title,
  destructive = true,
  pending,
  error,
  errorDescription,
  onConfirm,
  onReset,
  onRestoreFocus,
}: {
  title: string;
  actionLabel?: string;
  icon?: LucideIcon;
  description: ReactNode;
  confirmTitle: string;
  confirmDescription: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending: boolean;
  error?: Error | string | null;
  errorDescription: string;
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
