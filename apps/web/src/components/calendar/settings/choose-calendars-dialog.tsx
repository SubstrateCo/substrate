import type { ProviderCalendarOption } from "@substrate/contracts/calendar";

import { useId, useState } from "react";

import { CalendarColorDot } from "../calendar-color";
import { ReconnectNotice } from "../reconnect-notice";
import { calendarErrorCopy } from "./error-copy";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { Tag } from "@/components/feedback/tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, RotateCcw } from "lucide-react";

const optionRow =
  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-row-hover has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5 has-disabled:cursor-default has-disabled:opacity-60 has-disabled:hover:bg-transparent";

/** The calendars to preselect: the primary one, unless it is connected already. */
const initialSelection = (options: readonly ProviderCalendarOption[]) =>
  new Set(
    options.flatMap((option) =>
      option.isPrimary && !option.connectedEntityId ? [option.providerCalendarId] : [],
    ),
  );

/**
 * Chooses calendars to connect from one account. Connected calendars stay checked and cannot be
 * cleared here; disconnecting happens on the calendar's own row.
 */
export function ChooseCalendarsDialog({
  accountName,
  options,
  loadError,
  accessRequired,
  pending,
  error,
  reconnecting,
  onReconnect,
  onRetry,
  onConnect,
  onClose,
}: {
  accountName: string;
  options: readonly ProviderCalendarOption[] | undefined;
  loadError: Error | null;
  /** The account no longer grants calendar access, so it must be reconnected first. */
  accessRequired: boolean;
  pending: boolean;
  error: Error | null;
  /** The provider's consent page is opening. */
  reconnecting: boolean;
  onReconnect: () => void;
  onRetry: () => void;
  onConnect: (providerCalendarIds: string[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selected = chosen ?? (options ? initialSelection(options) : new Set<string>());
  const toggle = (calendarId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(calendarId);
    else next.delete(calendarId);
    setChosen(next);
  };
  const available = options?.filter((option) => !option.connectedEntityId) ?? [];
  const count = selected.size;
  const modal = modalDialogProps({ pending, onClose });
  return (
    <Dialog {...modal.root}>
      <DialogContent {...modal.content}>
        <DialogHeader>
          <DialogTitle>Add calendars</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {`Choose calendars from ${accountName} to sync with this organization.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {accessRequired && (
            <ReconnectNotice
              action={
                <PendingButton
                  variant="outline"
                  size="sm"
                  pending={reconnecting}
                  pendingLabel="Opening Google…"
                  onClick={onReconnect}
                >
                  <RotateCcw aria-hidden />
                  Reconnect with calendar access
                </PendingButton>
              }
            >
              Substrate can’t read this account’s calendars. Reconnect to grant calendar access.
            </ReconnectNotice>
          )}
          {loadError && !accessRequired && (
            <ErrorState
              compact
              title="Couldn’t load your calendars"
              description="Try again to see the calendars in this account."
              onRetry={onRetry}
            />
          )}
          {!loadError && !options && <LoadingState label="Loading calendars…" variant="compact" />}
          {!loadError && options?.length === 0 && (
            <ContentNotice
              compact
              icon={CalendarDays}
              title="No calendars in this account"
              description="Create a calendar in Google Calendar, then try again."
            />
          )}
          {!loadError && options && options.length > 0 && (
            <div role="group" aria-label="Calendars" className="grid gap-2">
              {options.map((option, index) => {
                const connected = !!option.connectedEntityId;
                return (
                  <label
                    key={option.providerCalendarId}
                    htmlFor={`${id}-${index}`}
                    className={optionRow}
                  >
                    <Checkbox
                      id={`${id}-${index}`}
                      checked={connected || selected.has(option.providerCalendarId)}
                      disabled={connected || pending}
                      onCheckedChange={(checked) =>
                        toggle(option.providerCalendarId, checked === true)
                      }
                    />
                    <CalendarColorDot color={option.color} />
                    <span className="min-w-0 flex-1 truncate" title={option.name}>
                      {option.name}
                    </span>
                    {option.isPrimary && <Tag>Primary</Tag>}
                    {connected && <Tag>Connected</Tag>}
                  </label>
                );
              })}
            </div>
          )}
          {!accessRequired && (
            <FormMessage
              error={error}
              errorDescription={calendarErrorCopy(
                error,
                "Couldn’t connect these calendars. Try again.",
              )}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <PendingButton
            pending={pending}
            pendingLabel="Connecting…"
            disabled={accessRequired || count === 0 || available.length === 0}
            onClick={() => onConnect([...selected])}
          >
            {count > 1 ? `Connect ${count} calendars` : "Connect calendar"}
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
