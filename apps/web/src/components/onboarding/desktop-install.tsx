import { desktopLink, desktopPath } from "@substrate/contracts/desktop/links";

import { useQuery } from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";

import { DesktopInstallView } from "@/components/onboarding/desktop-install-view";
import { safeRedirect } from "@/lib/auth/navigation";
import { desktop } from "@/lib/desktop/identity";
import { desktopReleaseQueryOptions } from "@/queries/desktop/release";

export function DesktopInstall({
  destination,
  browserLink,
}: {
  destination: string;
  /** Where "Continue in browser" goes. */
  browserLink: LinkProps;
}) {
  const release = useQuery(desktopReleaseQueryOptions());
  const path = desktopPath.safeParse(safeRedirect(destination));
  return (
    <DesktopInstallView
      openHref={desktopLink(path.success ? path.data : "/dashboard", desktop.scheme)}
      browserLink={browserLink}
      windowsAvailable={release.data?.windowsAvailable ?? false}
      loading={release.isPending}
      error={release.error}
      onRetry={() => void release.refetch()}
    />
  );
}
