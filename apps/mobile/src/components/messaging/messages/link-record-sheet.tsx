import type { ContextEntityType } from "@substrate/contracts/context/input";

import { useState } from "react";

import { LinkRecordSheetView } from "./link-record-sheet-view";
import {
  useLinkableKinds,
  useLinkableRecords,
  useLinkRecords,
} from "@/features/messaging/queries/use-linkable-records";
import { errorText } from "@/features/records/format";
import { captureToast } from "@/lib/toast";

export function LinkRecordSheet({
  organizationId,
  messageId,
  linkedIds,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  /** Records already linked or mentioned, shown as linked instead of selectable. */
  linkedIds: readonly string[];
  onClose: () => void;
}) {
  const apps = useLinkableKinds(organizationId);
  const [selectedKind, setKind] = useState<ContextEntityType>("task");
  const kind = apps.kinds.find((item) => item === selectedKind) ?? "contact";
  const [query, setQuery] = useState("");
  const search = useLinkableRecords({ organizationId, kind, query, enabled: apps.ready });
  const link = useLinkRecords(organizationId, messageId);
  const [linkError, setLinkError] = useState<string>();
  return (
    <LinkRecordSheetView
      kinds={apps.kinds}
      kind={kind}
      query={query}
      records={search.records}
      linkedIds={new Set(linkedIds)}
      loading={!apps.error && (apps.loading || search.loading)}
      error={apps.error ?? search.error}
      pending={link.isPending}
      linkError={linkError}
      onKind={setKind}
      onQuery={setQuery}
      onRetry={apps.error ? apps.retry : search.retry}
      onClose={onClose}
      onLink={(records) => {
        const feedback = captureToast();
        setLinkError(undefined);
        link.mutate(records, {
          onSuccess: ({ failed }) => {
            if (!failed.length) {
              feedback.success(records.length === 1 ? "Record linked" : "Records linked");
              return onClose();
            }
            const names = failed.map(({ item }) => `"${item.title}"`).join(", ");
            setLinkError(
              `Couldn't link ${names}. ${errorText(failed[0]!.error, "Check that you can still edit it.")}`,
            );
          },
          onError: (error) => setLinkError(errorText(error)),
        });
      }}
    />
  );
}
