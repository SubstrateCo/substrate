import type { ProviderCalendarOption } from "@substrate/contracts/calendar";

import { useId, useState } from "react";

import { CalendarColorDot } from "../calendar-color";
import { calendarErrorCopy } from "./error-copy";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { FormMessage } from "@/components/feedback/form-message";
import { InlineNotice } from "@/components/feedback/inline-notice";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { CalendarDays, RotateCcw, TriangleAlert } from "lucide-react";

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
            <InlineNotice
              icon={TriangleAlert}
              tone="warning"
              action={
                <PendingButton
                  variant="outline"
                  size="sm"
                  pending={reconnecting}
                  onClick={onReconnect}
                >
                  <RotateCcw aria-hidden />
                  Reconnect with calendar access
                </PendingButton>
              }
            >
              Substrate can’t read this account’s calendars. Reconnect to grant calendar access.
            </InlineNotice>
          )}
          <CalendarOptions
            options={options}
            loadError={loadError}
            accessRequired={accessRequired}
            selected={selected}
            pending={pending}
            onToggle={toggle}
            onRetry={onRetry}
          />
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

/** The account's calendars, or why they cannot be shown yet. */
function CalendarOptions({
  options,
  loadError,
  accessRequired,
  selected,
  pending,
  onToggle,
  onRetry,
}: {
  options: readonly ProviderCalendarOption[] | undefined;
  loadError: Error | null;
  accessRequired: boolean;
  selected: ReadonlySet<string>;
  pending: boolean;
  onToggle: (calendarId: string, checked: boolean) => void;
  onRetry: () => void;
}) {
  if (loadError)
    return accessRequired ? null : (
      <ErrorState compact title="Couldn’t load your calendars" onRetry={onRetry} />
    );
  if (!options) return <LoadingState label="Loading calendars" variant="compact" />;
  if (options.length === 0)
    return (
      <ContentNotice
        variant="compact"
        icon={CalendarDays}
        title="No calendars in this account"
        description="Create a calendar in Google Calendar, then try again."
      />
    );
  return (
    <CalendarOptionList
      options={options}
      selected={selected}
      pending={pending}
      onToggle={onToggle}
    />
  );
}

function CalendarOptionList({
  options,
  selected,
  pending,
  onToggle,
}: {
  options: readonly ProviderCalendarOption[];
  selected: ReadonlySet<string>;
  pending: boolean;
  onToggle: (calendarId: string, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-label="Calendars" className="grid gap-2">
      {options.map((option, index) => {
        const connected = !!option.connectedEntityId;
        return (
          <FieldLabel key={option.providerCalendarId} htmlFor={`${id}-${index}`}>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-${index}`}
                checked={connected || selected.has(option.providerCalendarId)}
                disabled={connected || pending}
                onCheckedChange={(checked) => onToggle(option.providerCalendarId, checked === true)}
              />
              <CalendarColorDot color={option.color} />
              <span className="min-w-0 flex-1 truncate" title={option.name}>
                {option.name}
              </span>
              {option.isPrimary && <Tag>Primary</Tag>}
              {connected && <Tag>Connected</Tag>}
            </Field>
          </FieldLabel>
        );
      })}
    </div>
  );
}
