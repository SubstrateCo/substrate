import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmResourceState } from "../crm-resource-state";
import { PipelineSettings, PipelineSettingsLoading } from "./pipeline-settings";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { SelectField, SelectFieldLoading } from "@/components/forms/select-field";
import { SettingsPanel } from "@/components/layout/settings-page";
import {
  SettingsCard,
  SettingsFooter,
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
      <SettingsPanel
        title="CRM settings"
        description="Manage your sales pipeline and defaults for new deals."
      >
        <div>
          <CrmResourceState
            pending={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            loading={
              <div role="status" aria-label="Loading CRM settings">
                <DealDefaultsSection>
                  <div className="max-w-56">
                    <SelectFieldLoading label="Default currency" />
                  </div>
                </DealDefaultsSection>
              </div>
            }
          />
          {state.data && !state.error && (
            <>
              <UnsavedChangesGuard
                dirty={dirty}
                name="CRM defaults"
                description="Your CRM defaults haven’t been saved."
              />
              <DealDefaultsSection
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
                <div className="max-w-56">
                  <SelectField
                    label="Default currency"
                    value={currency ?? ""}
                    onChange={(next) => setDraft({ currency: next || null })}
                    options={[{ value: "", label: "Not set" }, ...currencyChoices]}
                    disabled={!canEdit || mutation.isPending}
                  />
                </div>
                {!currency && (
                  <p className="text-sm text-muted-foreground">
                    No default set. Choose a currency when you add an amount to a deal.
                  </p>
                )}
                {!canEdit && (
                  <p className="text-sm text-muted-foreground">
                    Only workspace owners and admins can change CRM settings.
                  </p>
                )}
              </DealDefaultsSection>
            </>
          )}
        </div>
        <CrmResourceState
          pending={pipeline.isPending}
          error={pipeline.error}
          onRetry={() => void pipeline.refetch()}
          loading={<PipelineSettingsLoading />}
        />
        {!pipeline.error && pipeline.data && (
          <PipelineSettings
            organizationId={organizationId}
            stages={pipeline.data}
            canEdit={canEdit}
          />
        )}
      </SettingsPanel>
    </div>
  );
}

function DealDefaultsSection({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <SettingsSection
      title="Deal defaults"
      description="Applies to new deals only. Existing deals stay unchanged."
    >
      <SettingsCard label="CRM defaults" footer={footer}>
        {children}
      </SettingsCard>
    </SettingsSection>
  );
}
