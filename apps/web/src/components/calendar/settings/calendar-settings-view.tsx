import type {
  CalendarProvider,
  CalendarSettingsView as Settings,
} from "@substrate/contracts/calendar";

import { ProviderIcon } from "../provider-icon";
import { CalendarAccountCard, type CalendarAccountActions } from "./calendar-account-card";
import { CalendarRow } from "./calendar-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { FormMessage } from "@/components/feedback/form-message";
import { InlineNotice } from "@/components/feedback/inline-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { providerLabels } from "@/lib/calendar/labels";
import { CalendarDays, RotateCcw, TriangleAlert } from "lucide-react";

/** The viewer's calendar accounts in one organization. */
export function CalendarSettingsView({
  settings,
  now,
  pendingCalendarId,
  linking,
  error,
  errorDescription,
  accessRequired,
  actions,
  onConnect,
}: {
  settings: Settings;
  now: number;
  pendingCalendarId: string | null;
  /** The provider's consent page is opening. */
  linking: boolean;
  /** A failed change that no dialog shows. */
  error: Error | null;
  /** Reviewed copy for `error`. */
  errorDescription: string;
  /** A change failed because an account no longer grants calendar access. */
  accessRequired: boolean;
  actions: CalendarAccountActions;
  onConnect: (provider: CalendarProvider) => void;
}) {
  const connect = (variant: "default" | "outline") =>
    settings.providers.map((provider) => (
      <PendingButton
        key={provider}
        variant={variant}
        size={variant === "outline" ? "sm" : "default"}
        pending={linking}
        pendingLabel="Opening Google…"
        onClick={() => onConnect(provider)}
      >
        <ProviderIcon provider={provider} />
        {`Connect ${providerLabels[provider]} account`}
      </PendingButton>
    ));
  return (
    <>
      <SettingsSection
        title="Connected accounts"
        actions={settings.accounts.length > 0 ? connect("outline") : undefined}
      >
        {accessRequired && (
          <InlineNotice
            icon={TriangleAlert}
            tone="warning"
            action={
              <PendingButton
                variant="outline"
                size="sm"
                pending={linking}
                pendingLabel="Opening Google…"
                onClick={actions.onReconnectAccess}
              >
                <RotateCcw aria-hidden />
                Reconnect with calendar access
              </PendingButton>
            }
          >
            Substrate lost access to this calendar. Reconnect to grant calendar access again.
          </InlineNotice>
        )}
        {error && <FormMessage error={error} errorDescription={errorDescription} />}
        {settings.accounts.length === 0 ? (
          <div className="rounded-xl border bg-card p-5">
            <ContentNotice
              icon={CalendarDays}
              title="No calendars connected"
              description="Connect a calendar to see your meetings here and keep contacts up to date."
              action={settings.providers.length > 0 ? connect("default") : undefined}
            />
          </div>
        ) : (
          <div className="grid gap-4">
            {settings.accounts.map((account) => (
              <CalendarAccountCard
                key={account.credentialAccountId}
                account={account}
                now={now}
                pendingCalendarId={pendingCalendarId}
                reconnecting={linking}
                actions={actions}
              />
            ))}
          </div>
        )}
      </SettingsSection>
      {settings.detachedCalendars.length > 0 && (
        <SettingsSection
          title="Disconnected calendars"
          description="Their account was removed. Meetings and interactions they recorded are kept."
        >
          <SettingsList>
            {settings.detachedCalendars.map((calendar) => (
              <CalendarRow
                key={calendar.entityId}
                calendar={calendar}
                now={now}
                pending={false}
                readOnly
              />
            ))}
          </SettingsList>
        </SettingsSection>
      )}
    </>
  );
}
