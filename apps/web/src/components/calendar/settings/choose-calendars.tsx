import { useQuery } from "@tanstack/react-query";

import { ChooseCalendarsDialog } from "./choose-calendars-dialog";
import { isCalendarAccessRequired } from "@/api/calendar/access";
import type { useConnectCalendars } from "@/queries/calendar/mutations";
import { providerCalendarsOptions } from "@/queries/calendar/options";

export function ChooseCalendars({
  organizationId,
  credentialAccountId,
  accountName,
  mutation,
  reconnecting,
  reconnectError,
  onReconnect,
  onClose,
}: {
  organizationId: string;
  credentialAccountId: string;
  accountName: string;
  mutation: ReturnType<typeof useConnectCalendars>;
  reconnecting: boolean;
  reconnectError: Error | null;
  onReconnect: () => void;
  onClose: () => void;
}) {
  const query = useQuery(providerCalendarsOptions(organizationId, credentialAccountId));
  return (
    <ChooseCalendarsDialog
      accountName={accountName}
      options={query.data}
      loadError={query.error}
      accessRequired={
        isCalendarAccessRequired(query.error) || isCalendarAccessRequired(mutation.error)
      }
      pending={mutation.isPending}
      error={reconnectError ?? mutation.error}
      reconnecting={reconnecting}
      onReconnect={onReconnect}
      onRetry={() => void query.refetch()}
      onClose={onClose}
      onConnect={(providerCalendarIds) =>
        mutation.mutate({ credentialAccountId, providerCalendarIds }, { onSuccess: onClose })
      }
    />
  );
}
