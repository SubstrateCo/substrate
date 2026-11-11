import { useQuery } from "@tanstack/react-query";

import { SettingsPanel } from "@/components/layout/settings-page";
import { NameSettingsCard } from "@/components/settings/name-settings-card";
import { AccountEmailCard } from "@/components/settings/profile/account-email-card";
import { PictureSettings } from "@/components/settings/profile/picture-settings";
import { resourceState } from "@/lib/resource-state";
import { useUpdateProfileName } from "@/queries/auth/profile";
import { sessionQueryOptions } from "@/queries/auth/session";
import { usePictureMutations } from "@/queries/files/mutations";

export function UserProfile() {
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const { upload, remove } = usePictureMutations({ kind: "avatar" });
  const rename = useUpdateProfileName();
  const resource = resourceState(session);
  const user = resource.data?.user;
  return (
    <SettingsPanel title="Profile" description="How you appear to people in every workspace.">
      <PictureSettings
        state={resource.status}
        title="Profile picture"
        description="Shown next to your messages, tasks, and mentions."
        loading={session.isPending}
        error={session.error}
        onRetry={() => void session.refetch()}
        kind="avatar"
        value={user?.image}
        name={user?.name}
        disabled={session.isPending || upload.isPending || remove.isPending}
        onUpload={async (file, { signal, onCommit }) => {
          await upload.mutateAsync({ file, signal, onCommit });
        }}
        onRemove={async () => {
          await remove.mutateAsync();
        }}
      />
      {user && (
        <>
          <NameSettingsCard
            id="profile-name"
            title="Name"
            description="Your full name or the name your team knows you by."
            label="Full name"
            value={user.name}
            pending={rename.isPending}
            error={rename.error}
            errorDescription="We couldn’t save your name. Please try again."
            onSave={(name, onSaved) => {
              rename.reset();
              rename.mutate(name, { onSuccess: onSaved });
            }}
          />
          <AccountEmailCard email={user.email} verified={user.emailVerified} />
        </>
      )}
    </SettingsPanel>
  );
}
