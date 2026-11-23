import type { CalendarAccountView, CalendarView } from "@substrate/contracts/calendar";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { BackfillDialog } from "./backfill-dialog";
import type { CalendarAccountActions } from "./calendar-account-card";
import { CalendarSettingsView } from "./calendar-settings-view";
import { ChooseCalendars } from "./choose-calendars";
import { calendarErrorCopy } from "./error-copy";
import { isCalendarAccessRequired } from "@/api/calendar/access";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsPanel } from "@/components/layout/settings-page";
import { AppAvailability } from "@/components/workspace/app-availability";
import { useNow } from "@/hooks/use-now";
import { calendarAccountName } from "@/lib/calendar/groups";
import { useCalendarAccountLink, useUnlinkCalendarAccount } from "@/queries/calendar/account-link";
import {
  useCalendarAction,
  useConnectCalendars,
  useUpdateCalendar,
} from "@/queries/calendar/mutations";
import { calendarSettingsOptions } from "@/queries/calendar/options";
import { Building2 } from "lucide-react";

type Dialog =
  | { kind: "choose"; account: CalendarAccountView }
  | { kind: "remove"; account: CalendarAccountView }
  | { kind: "backfill"; calendar: CalendarView }
  | { kind: "disconnect"; calendar: CalendarView };

/** Settings → Calendars: the viewer's calendars in the active organization. */
export function CalendarSettingsPage({ organizationId }: { organizationId: string | null }) {
  return (
    <SettingsPanel title="Calendars">
      {organizationId ? (
        <AppAvailability app="calendar">
          <CalendarSettings key={organizationId} organizationId={organizationId} />
        </AppAvailability>
      ) : (
        <ContentNotice
          icon={Building2}
          title="Choose an organization"
          description="Calendars connect to one organization. Open an organization to connect yours."
        />
      )}
    </SettingsPanel>
  );
}

function CalendarSettings({ organizationId }: { organizationId: string }) {
  const query = useQuery(calendarSettingsOptions(organizationId));
  const now = useNow(true, 60_000);
  const update = useUpdateCalendar(organizationId);
  const action = useCalendarAction(organizationId);
  const connect = useConnectCalendars(organizationId);
  const link = useCalendarAccountLink();
  const unlink = useUnlinkCalendarAccount(organizationId);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const reset = () => {
    for (const mutation of [update, action, connect, link, unlink]) mutation.reset();
  };
  const open = (next: Dialog) => {
    reset();
    setDialog(next);
  };
  const close = () => setDialog(null);
  if (query.error)
    return <ErrorState title="Couldn’t load your calendars" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingState label="Loading calendars" />;
  const pendingCalendarId = savingCalendar(query.data.accounts, update, action, connect);
  const actions: CalendarAccountActions = {
    onRecordsInteractions: (calendar, recordsInteractions) => {
      reset();
      update.mutate({ calendarEntityId: calendar.entityId, recordsInteractions });
    },
    onPause: (calendar, paused) => {
      reset();
      update.mutate({ calendarEntityId: calendar.entityId, paused });
    },
    onBackfill: (calendar) => open({ kind: "backfill", calendar }),
    onDisconnect: (calendar) => open({ kind: "disconnect", calendar }),
    onReconnect: (calendar) => {
      if (!calendar.credentialAccountId) return;
      reset();
      connect.mutate({
        credentialAccountId: calendar.credentialAccountId,
        providerCalendarIds: [calendar.providerCalendarId],
      });
    },
    onAddCalendars: (account) => open({ kind: "choose", account }),
    onRemoveAccount: (account) => open({ kind: "remove", account }),
    onReconnectAccess: () => {
      reset();
      link.mutate();
    },
  };
  // Changes made from a row show their error above the accounts; dialogs show their own.
  const inlineError = dialog ? null : (update.error ?? action.error ?? connect.error ?? link.error);
  const accessRequired = isCalendarAccessRequired(inlineError);
  return (
    <>
      <CalendarSettingsView
        settings={query.data}
        now={now}
        pendingCalendarId={pendingCalendarId}
        linking={link.isPending}
        error={accessRequired ? null : inlineError}
        errorDescription={calendarErrorCopy(
          inlineError,
          "Couldn’t complete this change. Try again.",
        )}
        accessRequired={accessRequired}
        actions={actions}
        onConnect={() => {
          reset();
          link.mutate();
        }}
      />
      {dialog && (
        <CalendarSettingsDialog
          dialog={dialog}
          organizationId={organizationId}
          action={action}
          connect={connect}
          link={link}
          unlink={unlink}
          onClose={close}
        />
      )}
    </>
  );
}

function CalendarSettingsDialog({
  dialog,
  organizationId,
  action,
  connect,
  link,
  unlink,
  onClose,
}: {
  dialog: Dialog;
  organizationId: string;
  action: ReturnType<typeof useCalendarAction>;
  connect: ReturnType<typeof useConnectCalendars>;
  link: ReturnType<typeof useCalendarAccountLink>;
  unlink: ReturnType<typeof useUnlinkCalendarAccount>;
  onClose: () => void;
}) {
  switch (dialog.kind) {
    case "choose":
      return (
        <ChooseCalendars
          organizationId={organizationId}
          credentialAccountId={dialog.account.credentialAccountId}
          accountName={calendarAccountName(dialog.account)}
          mutation={connect}
          reconnecting={link.isPending}
          reconnectError={link.error}
          onReconnect={() => link.mutate()}
          onClose={onClose}
        />
      );
    case "backfill":
      return (
        <BackfillDialog
          calendarName={dialog.calendar.name}
          recordsInteractions={dialog.calendar.recordsInteractions}
          pending={action.isPending}
          error={action.error}
          onClose={onClose}
          onConfirm={() =>
            action.mutate(
              { calendarEntityId: dialog.calendar.entityId, action: "backfill" },
              { onSuccess: onClose },
            )
          }
        />
      );
    case "disconnect":
      return (
        <ConfirmDialog
          destructive
          title={`Disconnect ${dialog.calendar.name}?`}
          description="Substrate stops syncing this calendar. Contacts and interactions it already created are kept."
          confirmLabel="Disconnect calendar"
          pending={action.isPending}
          error={action.error}
          errorDescription="Couldn’t disconnect this calendar. Try again."
          onClose={onClose}
          onConfirm={() =>
            action.mutate(
              { calendarEntityId: dialog.calendar.entityId, action: "disconnect" },
              { onSuccess: onClose },
            )
          }
        />
      );
    case "remove":
      return (
        <ConfirmDialog
          destructive
          title={`Remove ${calendarAccountName(dialog.account)}?`}
          description="Substrate loses access to this account in every organization. Its calendars stop syncing and move to Disconnected calendars; their contacts and interactions are kept."
          confirmLabel="Remove account"
          pending={unlink.isPending}
          error={unlink.error}
          errorDescription="Couldn’t remove this account. Try again."
          onClose={onClose}
          onConfirm={() =>
            unlink.mutate(dialog.account.credentialAccountId, { onSuccess: onClose })
          }
        />
      );
  }
}

// The calendar row whose change is saving, so only that row shows it.
function savingCalendar(
  accounts: readonly CalendarAccountView[],
  update: ReturnType<typeof useUpdateCalendar>,
  action: ReturnType<typeof useCalendarAction>,
  connect: ReturnType<typeof useConnectCalendars>,
) {
  return (
    (update.isPending && update.variables.calendarEntityId) ||
    (action.isPending && action.variables.calendarEntityId) ||
    (connect.isPending && connect.variables.providerCalendarIds.length === 1
      ? connectingCalendar(accounts, connect.variables)
      : null) ||
    null
  );
}

// A reconnect sends one provider calendar; find its row so only that row shows it is saving.
function connectingCalendar(
  accounts: readonly CalendarAccountView[],
  variables: { credentialAccountId: string; providerCalendarIds: string[] },
) {
  const account = accounts.find(
    (item) => item.credentialAccountId === variables.credentialAccountId,
  );
  return (
    account?.calendars.find(
      (calendar) => calendar.providerCalendarId === variables.providerCalendarIds[0],
    )?.entityId ?? null
  );
}
