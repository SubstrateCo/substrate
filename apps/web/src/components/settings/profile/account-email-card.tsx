import { SettingsCard } from "@/components/layout/settings-section";
import { BadgeCheck, TriangleAlert } from "lucide-react";

/** The sign-in email, read-only. Changing it needs a verified email-change flow first. */
export function AccountEmailCard({ email, verified }: { email: string; verified: boolean }) {
  return (
    <SettingsCard
      title="Email"
      description="You sign in with this address. Workspace invitations are sent here."
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 text-sm font-medium wrap-anywhere">{email}</span>
        {verified ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BadgeCheck aria-hidden="true" className="size-4 text-success" />
            Verified
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
            Not verified
          </span>
        )}
      </div>
    </SettingsCard>
  );
}
