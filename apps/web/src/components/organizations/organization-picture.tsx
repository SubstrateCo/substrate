import { useQuery } from "@tanstack/react-query";
import { PictureSettings } from "@startup-os/ui/settings/picture-settings";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { usePictureMutations } from "@/queries/files/mutations";

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
