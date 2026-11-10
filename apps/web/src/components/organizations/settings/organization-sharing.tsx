import { SharingSettings } from "@/components/messaging/sharing/sharing-settings";

// The sharing domain owns this section's header and content; settings only places it.
export function OrganizationSharing({ organizationId }: { organizationId: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <SharingSettings organizationId={organizationId} />
    </div>
  );
}
