import type { CalendarAccountView } from "@substrate/contracts/calendar";

import { useId } from "react";

import { ProviderIcon } from "../provider-icon";
import { CalendarRow, type CalendarRowActions } from "./calendar-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { InlineNotice } from "@/components/feedback/inline-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { providerLabels } from "@/lib/calendar/labels";
import { Plus, RotateCcw, TriangleAlert, Unlink } from "lucide-react";

export interface CalendarAccountActions extends CalendarRowActions {
  onAddCalendars: (account: CalendarAccountView) => void;
  onRemoveAccount: (account: CalendarAccountView) => void;
  onReconnectAccess: () => void;
}

export function CalendarAccountCard({
  account,
  now,
  pendingCalendarId,
  reconnecting,
  actions,
}: {
  account: CalendarAccountView;
  now: number;
  pendingCalendarId: string | null;
  reconnecting: boolean;
  actions: CalendarAccountActions;
}) {
  const id = useId();
  const provider = providerLabels[account.provider];
  const name = account.email ?? `${provider} account`;
  const needsAccess =
    !account.hasCalendarAccess ||
    account.calendars.some((calendar) => calendar.syncStatus === "reauth_required");
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 overflow-hidden rounded-xl border bg-card"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <ProviderIcon provider={account.provider} />
          </div>
          <div className="min-w-0">
            <Heading level={3} id={`${id}-title`} className="truncate" title={name}>
              {name}
            </Heading>
            <p className="text-xs text-muted-foreground">{provider} Calendar</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!account.hasCalendarAccess}
            onClick={() => actions.onAddCalendars(account)}
          >
            <Plus aria-hidden />
            Add calendars
          </Button>
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => actions.onRemoveAccount(account)}
          >
            <Unlink aria-hidden />
            Remove account
          </Button>
        </div>
      </header>
      {needsAccess && (
        <div className="px-5 pb-4">
          <InlineNotice
            icon={TriangleAlert}
            tone="warning"
            action={
              <PendingButton
                variant="outline"
                size="sm"
                pending={reconnecting}
                onClick={actions.onReconnectAccess}
              >
                <RotateCcw aria-hidden />
                Reconnect with calendar access
              </PendingButton>
            }
          >
            {account.hasCalendarAccess
              ? `${provider} stopped sharing calendars with Substrate. Reconnect to resume syncing.`
              : "This account was linked without calendar access. Reconnect to choose calendars."}
          </InlineNotice>
        </div>
      )}
      {account.calendars.length > 0 ? (
        <ul aria-label={`Calendars from ${name}`} className="divide-y border-t">
          {account.calendars.map((calendar) => (
            <CalendarRow
              key={calendar.entityId}
              calendar={calendar}
              now={now}
              pending={pendingCalendarId === calendar.entityId}
              actions={actions}
            />
          ))}
        </ul>
      ) : (
        <div className="border-t px-5 py-4">
          <ContentNotice variant="inline" title="No calendars connected from this account yet" />
        </div>
      )}
    </section>
  );
}
