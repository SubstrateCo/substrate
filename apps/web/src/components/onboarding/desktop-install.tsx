import { desktopLink, desktopPath } from "@startup-os/contracts/desktop/links";

import { useQuery } from "@tanstack/react-query";

import { DesktopInstallView } from "@/components/onboarding/desktop-install-view";
import { safeRedirect } from "@/lib/auth/navigation";
import { desktopReleaseQueryOptions } from "@/queries/desktop/release";

export function DesktopInstall({ destination }: { destination: string }) {
  const release = useQuery(desktopReleaseQueryOptions());
  const path = desktopPath.safeParse(safeRedirect(destination));
  return (
    <DesktopInstallView
      openHref={desktopLink(path.success ? path.data : "/dashboard")}
      windowsAvailable={release.data?.windowsAvailable ?? false}
      loading={release.isPending}
      error={release.error}
      onRetry={() => void release.refetch()}
    />
  );
}
