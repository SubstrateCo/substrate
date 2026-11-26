import { Link, type LinkProps } from "@tanstack/react-router";

import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Skeleton } from "@/components/ui/skeleton";
import { type InstallerPlatform, installerPlatformNames } from "@/lib/desktop/installer";
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
  primary,
  others,
  loading,
  error,
  onRetry,
  heading = true,
}: {
  openHref: string;
  browserLink: LinkProps;
  /** The viewer's OS, when the browser reports one we publish for. */
  platform: InstallerPlatform | undefined;
  /** The installer offered first. */
  primary: InstallerPlatform | undefined;
  /** Other published installers. */
  others: InstallerPlatform[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Whether the step shows its own title. Off when the page title already names the app. */
  heading?: boolean;
}) {
  const browserPrimary = !loading && !error && !primary;
  const { title, description } = installCopy(platform, primary, browserPrimary);

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
      {error && (
        <ErrorState
          variant="compact"
          title="Couldn’t check for the installer"
          description="You can still open an installed app or continue in your browser."
          onRetry={onRetry}
        />
      )}
      <DesktopInstallActions
        openHref={openHref}
        browserLink={browserLink}
        primary={primary}
        others={others}
        browserPrimary={browserPrimary}
        loading={loading}
      />
    </section>
  );
}

/** The title and description for the viewer's installer, or for continuing in the browser. */
function installCopy(
  platform: InstallerPlatform | undefined,
  primary: InstallerPlatform | undefined,
  browserPrimary: boolean,
) {
  const title = "Get the desktop app";
  if (primary === "mac")
    return {
      title,
      description:
        "Install Substrate for macOS on Apple silicon, then sign in with the same account.",
    };
  if (primary)
    return {
      title,
      description: `Install Substrate for ${installerPlatformNames[primary]}, then sign in with the same account.`,
    };
  if (browserPrimary)
    return {
      title: `The ${platform ? installerPlatformNames[platform] : "desktop"} app is coming soon`,
      description: "Keep working in your browser for now. If you already have the app, open it.",
    };
  return { title, description: "Install Substrate, then sign in with the same account." };
}

function DesktopInstallActions({
  openHref,
  browserLink,
  primary,
  others,
  browserPrimary,
  loading,
}: {
  openHref: string;
  browserLink: LinkProps;
  primary: InstallerPlatform | undefined;
  others: InstallerPlatform[];
  browserPrimary: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {primary ? (
        <Button asChild size="lg">
          <a href={downloadHref(primary)} rel="noreferrer">
            <Download aria-hidden="true" />
            Download for {installerPlatformNames[primary]}
          </a>
        </Button>
      ) : (
        browserPrimary && (
          <Button asChild size="lg">
            <Link {...browserLink}>Continue in browser</Link>
          </Button>
        )
      )}
      <Button asChild size="lg" variant="outline">
        <a href={openHref} rel="noreferrer">
          <ArrowUpRight aria-hidden="true" />
          Open Substrate
        </a>
      </Button>
      {/* Other installers and the browser stay available without competing with the download. */}
      <div className="flex flex-wrap justify-center gap-x-4">
        {others.map((other) => (
          <Button key={other} asChild size="sm" variant="link">
            <a href={downloadHref(other)} rel="noreferrer">
              Download for {installerPlatformNames[other]}
            </a>
          </Button>
        ))}
        {!browserPrimary && !loading && (
          <Button asChild size="sm" variant="link">
            <Link {...browserLink}>Continue in browser</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
