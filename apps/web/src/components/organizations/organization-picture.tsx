import { useQuery } from "@tanstack/react-query";

import { usePictureMutations } from "@/queries/files/mutations";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { PictureSettings } from "@/ui/settings/picture-settings";

export function OrganizationPicture({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const { upload, remove } = usePictureMutations("organization-logo", organizationId);
  return (
    <PictureSettings
      title="Organization logo"
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
