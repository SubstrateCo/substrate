import { Tag } from "@/components/feedback/tag";
import { SettingsDetail } from "@/components/layout/settings-section";
import { BadgeCheck, TriangleAlert } from "lucide-react";

/** The sign-in email, read-only. Changing it needs a verified email-change flow first. */
export function AccountEmailCard({ email, verified }: { email: string; verified: boolean }) {
  return (
    <SettingsDetail
      title="Email"
      description="You sign in with this address. Workspace invitations are sent here."
    >
      <div className="flex max-w-xl min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 text-sm font-medium wrap-anywhere">{email}</span>
        {verified ? (
          <Tag tone="success" icon={<BadgeCheck aria-hidden="true" className="size-3" />}>
            Verified
          </Tag>
        ) : (
          <Tag tone="warning" icon={<TriangleAlert aria-hidden="true" className="size-3" />}>
            Not verified
          </Tag>
        )}
      </div>
    </SettingsDetail>
  );
}
