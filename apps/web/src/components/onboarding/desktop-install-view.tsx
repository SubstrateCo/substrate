import { Link, type LinkProps } from "@tanstack/react-router";

import { ErrorState } from "@/components/feedback/error-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type InstallMode,
  type InstallerPlatform,
  installerPlatformNames,
} from "@/lib/desktop/installer";
import { ArrowUpRight, Download, Laptop } from "lucide-react";

const downloadHref = (platform: InstallerPlatform) => `/desktop/download?platform=${platform}`;

/**
 * The desktop app step. The installer for the viewer's OS decides the whole state: with one, the
 * download is primary; without one, continuing in the browser is primary. Opening an installed
 * app is always the secondary path, and other installers and the browser are quiet links.
 */
export function DesktopInstallView({
  openHref,
  browserLink,
  platform,
  mode,
  others,
  error,
  onRetry,
  heading = true,
}: {
  openHref: string;
  browserLink: LinkProps;
  /** The viewer's OS, when the browser reports one we publish for. */
  platform: InstallerPlatform | undefined;
  mode: InstallMode;
  /** Other published installers. */
  others: InstallerPlatform[];
  error: Error | null;
  onRetry: () => void;
  /** Whether the step shows its own title. Off when the page title already names the app. */
  heading?: boolean;
}) {
  const loading = mode.kind === "loading";
  const { title, description } = installCopy(platform, mode);

  const summary = loading ? (
    <Skeleton className="h-4 w-56 max-w-full" />
  ) : (
    <p className="text-sm text-muted-foreground">{description}</p>
  );

  return (
    <section
      className="space-y-4"
      aria-labelledby={heading ? "desktop-install-title" : undefined}
      aria-label={heading ? undefined : title}
      aria-busy={loading}
    >
      {heading ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <Laptop className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            {/* oxlint-disable-next-line shadcn/no-restyle -- Balance mobile line breaks without changing the heading's type role. */}
            <Heading level={2} id="desktop-install-title" className="max-sm:text-balance">
              {title}
            </Heading>
            {summary}
          </div>
        </div>
      ) : (
        summary
      )}
      <InstallError mode={mode} error={error} onRetry={onRetry} />
      <div className="flex flex-col gap-2">
        <InstallPrimaryAction mode={mode} browserLink={browserLink} />
        <Button asChild size="lg" variant="outline">
          <a href={openHref} rel="noreferrer">
            <ArrowUpRight aria-hidden="true" />
            Open Substrate
          </a>
        </Button>
        <InstallSecondaryLinks mode={mode} others={others} browserLink={browserLink} />
      </div>
    </section>
  );
}

/** The title and description for the viewer's installer, or for continuing in the browser. */
function installCopy(platform: InstallerPlatform | undefined, mode: InstallMode) {
  const title = "Get the desktop app";
  if (mode.kind === "download" && mode.platform === "mac")
    return {
      title,
      description:
        "Install Substrate for macOS on Apple silicon, then sign in with the same account.",
    };
  if (mode.kind === "download")
    return {
      title,
      description: `Install Substrate for ${installerPlatformNames[mode.platform]}, then sign in with the same account.`,
    };
  if (mode.kind === "browser")
    return {
      title: `The ${platform ? installerPlatformNames[platform] : "desktop"} app is coming soon`,
      description: "Keep working in your browser for now. If you already have the app, open it.",
    };
  return { title, description: "Install Substrate, then sign in with the same account." };
}

/** A failed first check replaces the choice; a failed refresh sits quietly above the last one. */
function InstallError({
  mode,
  error,
  onRetry,
}: {
  mode: InstallMode;
  error: Error | null;
  onRetry: () => void;
}) {
  if (mode.kind === "error")
    return (
      <ErrorState
        variant="compact"
        title="Couldn’t check for the installer"
        description="You can still open an installed app or continue in your browser."
        onRetry={onRetry}
      />
    );
  if (!error || mode.kind === "loading") return null;
  return <StaleNotice title="Couldn’t refresh the installers" onRetry={onRetry} />;
}

function InstallPrimaryAction({
  mode,
  browserLink,
}: {
  mode: InstallMode;
  browserLink: LinkProps;
}) {
  if (mode.kind === "download")
    return (
      <Button asChild size="lg">
        <a href={downloadHref(mode.platform)} rel="noreferrer">
          <Download aria-hidden="true" />
          Download for {installerPlatformNames[mode.platform]}
        </a>
      </Button>
    );
  if (mode.kind === "browser")
    return (
      <Button asChild size="lg">
        <Link {...browserLink}>Continue in browser</Link>
      </Button>
    );
  return null;
}

/** Other installers and the browser stay available without competing with the download. */
function InstallSecondaryLinks({
  mode,
  others,
  browserLink,
}: {
  mode: InstallMode;
  others: InstallerPlatform[];
  browserLink: LinkProps;
}) {
  const browser = mode.kind === "download" || mode.kind === "error";
  return (
    <div className="flex flex-wrap justify-center gap-x-4">
      {others.map((other) => (
        <Button key={other} asChild size="sm" variant="link">
          <a href={downloadHref(other)} rel="noreferrer">
            Download for {installerPlatformNames[other]}
          </a>
        </Button>
      ))}
      {browser && (
        <Button asChild size="sm" variant="link">
          <Link {...browserLink}>Continue in browser</Link>
        </Button>
      )}
    </div>
  );
}
