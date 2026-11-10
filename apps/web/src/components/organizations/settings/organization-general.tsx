import { useQuery } from "@tanstack/react-query";

import { SettingsPanel } from "@/components/layout/settings-page";
import { OrganizationPicture } from "@/components/organizations/settings/organization-picture";
import { NameSettingsCard } from "@/components/settings/name-settings-card";
import { useOrganizationMutations } from "@/queries/organizations/mutations";
import { organizationQueryOptions } from "@/queries/organizations/options";

export function OrganizationGeneral({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const { rename } = useOrganizationMutations(organizationId);
  return (
    <SettingsPanel
      title="General"
      description="The name and logo everyone in this organization sees."
    >
      {organization.data && (
        <NameSettingsCard
          id="organization-name"
          title="Name"
          description="Usually your company or team name."
          label="Organization name"
          value={organization.data.name}
          pending={rename.isPending}
          error={rename.error}
          errorDescription="We couldn't rename the organization. Please try again."
          onSave={(name, onSaved) => {
            rename.reset();
            rename.mutate(name, { onSuccess: onSaved });
          }}
        />
      )}
      <OrganizationPicture organizationId={organizationId} />
    </SettingsPanel>
  );
}
