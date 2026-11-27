import { desktopLink, desktopPath } from "@substrate/contracts/desktop/links";

import { useQuery } from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";

import { DesktopInstallView } from "@/components/onboarding/desktop-install-view";
import { safeRedirect } from "@/lib/auth/navigation";
import { desktop } from "@/lib/desktop/identity";
import { browserInstallerPlatform, chooseInstallers } from "@/lib/desktop/installer";
import { desktopReleaseQueryOptions } from "@/queries/desktop/release";

export function DesktopInstall({
  destination,
  browserLink,
  heading,
}: {
  destination: string;
  /** Where "Continue in browser" goes. */
  browserLink: LinkProps;
  heading?: boolean;
}) {
  const release = useQuery(desktopReleaseQueryOptions());
  const path = desktopPath.safeParse(safeRedirect(destination));
  const platform = browserInstallerPlatform(navigator);
  const { primary, others } = chooseInstallers(
    {
      windows: release.data?.windowsAvailable ?? false,
      mac: release.data?.macAvailable ?? false,
    },
    platform,
  );
  return (
    <DesktopInstallView
      openHref={desktopLink(path.success ? path.data : "/messages", desktop.scheme)}
      browserLink={browserLink}
      platform={platform}
      primary={primary}
      others={others}
      loading={release.isPending}
      error={release.error}
      onRetry={() => void release.refetch()}
      heading={heading}
    />
  );
}
