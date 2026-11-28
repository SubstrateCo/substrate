import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmResourceBoundary } from "./crm-resource-state";
import {
  interactionScopeMode,
  interactionScopeValue,
  type InteractionScopeFieldId,
} from "./interaction-scope";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { ContactLink } from "@/components/contacts/contact-link";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { FilterBar, type FilterField } from "@/components/filters";
import { InteractionLink } from "@/components/interactions/interaction-link";
import { InteractionRow } from "@/components/interactions/interaction-row";
import { RecordSection, recordRows } from "@/components/layout/record-section";
import { Pager, useCursorPages } from "@/components/table";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState } from "@/lib/resource-state";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { crmTimelineOptions } from "@/queries/crm/options";
import { keepPageWhileTurning } from "@/queries/page-turn";
import { Users } from "lucide-react";

const interactionScopeFields: FilterField<InteractionScopeFieldId>[] = [
  {
    id: "scope",
    label: "Scope",
    icon: Users,
    kind: "option",
    required: true,
    options: [
      { value: "linked", label: "Explicitly linked" },
      { value: "participants", label: "Related contacts" },
    ],
  },
];

export function InteractionRollup({
  entityId,
  kind,
}: {
  entityId: string;
  kind: "account" | "deal";
}) {
  const { organizationId } = useWorkspaceScope();
  const [mode, setMode] = useState<CrmTimelineMode>(kind === "deal" ? "linked" : "participants");
  const pages = useCursorPages<{ beforeOccurredAt: string; beforeEntityId: string }>();
  const options = crmTimelineOptions(organizationId, entityId, mode, pages.cursor ?? null);
  const query = useQuery({ ...options, placeholderData: keepPageWhileTurning(options.queryKey) });
  const state = resourceState(query);
  const rows = state.data ?? [];
  const apps = useOrganizationApps();
  const sources = useInteractionSources(organizationId, rows, apps.enabled("calendar"));
  return (
    <RecordSection
      aria-label="Customer interaction timeline"
      title="Customer interactions"
      actions={
        <FilterBar
          aria-label="Interaction filters"
          fields={interactionScopeFields}
          value={interactionScopeValue(mode)}
          onValueChange={(value) => {
            const next = interactionScopeMode(value, mode);
            if (next === mode) return;
            setMode(next);
            pages.reset();
          }}
        />
      }
      description={
        mode === "linked"
          ? "Interactions explicitly linked to this record. No customer-wide activity is implied."
          : "Readable interactions from related contacts and explicit links. A touch does not mean it advanced this pursuit."
      }
    >
      <CrmResourceBoundary
        compact
        noun="interactions"
        state={state}
        onRetry={() => void query.refetch()}
        loading={
          <div role="status" aria-label="Loading customer interactions">
            <ol className={recordRows} aria-hidden="true">
              {[0, 1, 2].map((key) => (
                <li key={key} className={interactionRow}>
                  <p className="text-sm">
                    <SkeletonText width="16rem" />
                  </p>
                  <div className="text-xs">
                    <SkeletonText width="10rem" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        }
      >
        {(loaded) =>
          loaded.length === 0 ? (
            <ContentNotice variant="inline" title="No interactions in this view" />
          ) : (
            <ol className={recordRows}>
              {loaded.map((row) => (
                <InteractionRow
                  key={row.entityId}
                  kind={row.kind}
                  occurredAt={row.occurredAt}
                  summary={
                    <InteractionLink
                      entityId={row.entityId}
                      className="underline-offset-4 hover:underline"
                      aria-label={`Open interaction: ${row.summary}`}
                    >
                      {row.summary}
                    </InteractionLink>
                  }
                  details={[
                    <ContactLink
                      key="contact"
                      entityId={row.contactEntityId}
                      className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Open contact
                    </ContactLink>,
                  ]}
                  source={
                    <MeetingSourceLink source={sources[row.entityId]} className="max-w-full" />
                  }
                />
              ))}
            </ol>
          )
        }
      </CrmResourceBoundary>
      {(pages.pageIndex > 0 || rows.length === pageSize) && (
        <Pager
          name="Customer interactions"
          pageIndex={pages.pageIndex}
          pageCount={-1}
          canPrevious={pages.pageIndex > 0}
          canNext={rows.length === pageSize}
          disabled={query.isFetching}
          onPageChange={(pageIndex) => {
            const last = rows.at(-1);
            if (pageIndex < pages.pageIndex) pages.previous();
            else if (last)
              pages.next({ beforeOccurredAt: last.occurredAt, beforeEntityId: last.entityId });
          }}
        />
      )}
    </RecordSection>
  );
}

const pageSize = 50;
const interactionRow = "grid min-w-0 gap-1 rounded-md px-2 py-1.5 hover:bg-row-hover";
