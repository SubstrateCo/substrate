import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmResourceState } from "./crm-resource-state";
import { CrmSelect } from "./crm-select";
import { PipelineSettings } from "./pipeline-settings";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsContent } from "@/components/layout/settings-page";
import {
  SettingsCard,
  SettingsFooter,
  SettingsNote,
  SettingsSection,
} from "@/components/layout/settings-section";
import { resourceState } from "@/lib/resource-state";
import { useCrmMutation } from "@/queries/crm/mutations";
import { crmSettingsOptions, pipelineOptions } from "@/queries/crm/options";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

const currencyChoices = Intl.supportedValuesOf("currency").map((currency) => ({
  value: currency,
  label: currency,
}));

export function CrmSettings({ organizationId }: { organizationId: string }) {
  const query = useQuery(crmSettingsOptions(organizationId));
  const pipeline = useQuery(pipelineOptions(organizationId));
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const mutation = useCrmMutation(organizationId);
  const [draft, setDraft] = useState<{ currency: string | null } | null>(null);
  const state = resourceState(query);
  const canEdit =
    !organization.error && organizationSettingsAccess(organization.data?.role).allowed;
  const currency = draft ? draft.currency : (state.data?.defaultCurrency ?? null);
  const dirty = !!state.data && currency !== state.data.defaultCurrency;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <SettingsContent>
        <PageHeader
          title="CRM settings"
          description="Workspace defaults for new customer work. Existing records are not changed."
        />
        <CrmResourceState
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        {state.data && !state.error && (
          <>
            <UnsavedChangesGuard
              dirty={dirty}
              name="CRM defaults"
              description="Your CRM defaults haven’t been saved."
            />
            <SettingsSection
              title="Deal defaults"
              description="Set only the defaults your team needs."
            >
              <SettingsCard
                title="Default currency"
                description="Applies to new deals. Existing deals keep their currency."
                footer={
                  canEdit && (
                    <SettingsFooter
                      dirty={dirty}
                      pending={mutation.isPending}
                      error={
                        mutation.error
                          ? actionErrorMessage(
                              mutation.error,
                              "Couldn’t save CRM defaults. Try again.",
                            )
                          : undefined
                      }
                      onDiscard={() => {
                        setDraft(null);
                        mutation.reset();
                      }}
                      onSave={() =>
                        mutation.mutate(
                          { action: "updateSettings", organizationId, defaultCurrency: currency },
                          { onSuccess: () => setDraft(null) },
                        )
                      }
                    />
                  )
                }
              >
                <CrmSelect
                  label="Default currency"
                  value={currency ?? ""}
                  onValueChange={(next) => setDraft({ currency: next || null })}
                  options={currencyChoices}
                  optional
                  emptyLabel="Not set"
                  disabled={!canEdit || mutation.isPending}
                />
                {!currency && (
                  <SettingsNote>
                    No default currency is set. Choose a currency on each new deal when you enter an
                    amount.
                  </SettingsNote>
                )}
                {!canEdit && (
                  <SettingsNote>
                    Only workspace owners and admins can change CRM settings.
                  </SettingsNote>
                )}
                <SettingsNote>
                  Amounts, expected close dates, and responsible owners have no workspace default.
                </SettingsNote>
              </SettingsCard>
            </SettingsSection>
          </>
        )}
        <CrmResourceState
          pending={pipeline.isPending}
          error={pipeline.error}
          onRetry={() => void pipeline.refetch()}
        />
        {!pipeline.error && pipeline.data && (
          <PipelineSettings
            organizationId={organizationId}
            stages={pipeline.data}
            canEdit={canEdit}
          />
        )}
      </SettingsContent>
    </div>
  );
}
