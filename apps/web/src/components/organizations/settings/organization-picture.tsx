import { useQuery } from "@tanstack/react-query";

import { PictureSettings } from "@/components/settings/profile/picture-settings";
import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
import { resourceState } from "@/lib/resource-state";
import { usePictureMutations } from "@/queries/files/mutations";
import { organizationQueryOptions } from "@/queries/organizations/options";

export function OrganizationPicture({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const resource = resourceState(organization);
  const mutations = usePictureMutations({ kind: "organization-logo", organizationId });
  return (
    <PictureSettings
      state={resource.status}
      title="Logo"
      description="Shown in the workspace switcher for everyone in it."
      kind="organization-logo"
      value={resource.data?.logo}
      name={resource.data?.name}
      loading={organization.isPending}
      error={organization.error}
      onRetry={() => void organization.refetch()}
      {...pictureMutationProps(mutations)}
    />
  );
}
