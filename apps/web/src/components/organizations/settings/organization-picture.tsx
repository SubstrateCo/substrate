import { useQuery } from "@tanstack/react-query";

import { PictureSettings } from "@/components/settings/profile/picture-settings";
import { usePictureMutations } from "@/queries/files/mutations";
import { organizationQueryOptions } from "@/queries/organizations/options";

export function OrganizationPicture({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const { upload, remove } = usePictureMutations("organization-logo", organizationId);
  return (
    <PictureSettings
      title="Logo"
      description="Shown in the workspace switcher for everyone in it."
      kind="organization-logo"
      value={organization.data?.logo}
      loading={organization.isPending}
      error={organization.error}
      onRetry={() => void organization.refetch()}
      disabled={upload.isPending || remove.isPending}
      onUpload={async (file, { signal, onCommit }) => {
        await upload.mutateAsync({ file, signal, onCommit });
      }}
      onRemove={async () => {
        await remove.mutateAsync();
      }}
    />
  );
}
