import { useQuery } from "@tanstack/react-query";

import { SettingsPanel } from "@/components/layout/settings-page";
import { NameSettingsCard } from "@/components/settings/name-settings-card";
import { AccountEmailCard } from "@/components/settings/profile/account-email-card";
import { PictureSettings } from "@/components/settings/profile/picture-settings";
import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
import { resourceState } from "@/lib/resource-state";
import { useUpdateProfileName } from "@/queries/auth/profile";
import { sessionQueryOptions } from "@/queries/auth/session";
import { usePictureMutations } from "@/queries/files/mutations";

export function UserProfile() {
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const pictureMutations = usePictureMutations({ kind: "avatar" });
  const rename = useUpdateProfileName();
  const resource = resourceState(session);
  const user = resource.data?.user;
  return (
    <SettingsPanel title="Profile" description="How you appear to people in every workspace.">
      <div className="min-w-0 divide-y border-y py-6">
        <PictureSettings
          layout="row"
          state={resource.status}
          title="Profile picture"
          description="Shown next to your messages, tasks, and mentions."
          onRetry={() => void session.refetch()}
          kind="avatar"
          value={user?.image}
          name={user?.name}
          disabled={session.isPending}
          {...pictureMutationProps(pictureMutations)}
        />
        {user && (
          <>
            <NameSettingsCard
              id="profile-name"
              title="Name"
              description="Your full name or the name your team knows you by."
              label="Full name"
              missingMessage="Enter your name."
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
      </div>
    </SettingsPanel>
  );
}
