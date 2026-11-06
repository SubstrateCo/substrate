import { useQuery } from "@tanstack/react-query";
import { PictureUpload } from "@startup-os/ui/upload/picture-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@startup-os/ui/primitives/card";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { organizationQueryOptions } from "@/queries/organizations/options";
import { usePictureMutations } from "@/queries/files/mutations";

export function OrganizationPicture({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const { upload, remove } = usePictureMutations("organization-logo", organizationId);
  let content;
  if (organization.isPending) {
    content = <LoadingState label="Loading organization logo…" variant="compact" rows={1} />;
  } else if (organization.error) {
    content = (
      <ErrorState
        compact
        title="Couldn’t load organization logo"
        onRetry={() => void organization.refetch()}
      />
    );
  } else {
    content = (
      <PictureUpload
        kind="organization-logo"
        value={organization.data.logo}
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization logo</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
