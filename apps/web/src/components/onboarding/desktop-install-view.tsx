import { Link, type LinkProps } from "@tanstack/react-router";

import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, Download, Laptop } from "lucide-react";

/**
 * The desktop app step. Installer availability decides the whole state: with an installer the
 * download is primary; without one, continuing in the browser is primary. Opening an installed
 * app is always the secondary path.
 */
export function DesktopInstallView({
  openHref,
  browserLink,
  windowsAvailable,
  loading,
  error,
  onRetry,
  heading = true,
}: {
  openHref: string;
  browserLink: LinkProps;
  windowsAvailable: boolean;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Whether the step shows its own title. Off when the page title already names the app. */
  heading?: boolean;
}) {
  const openInstalled = (
    <Button asChild size="lg" variant="outline">
      <a href={openHref} rel="noreferrer">
        <ArrowUpRight aria-hidden="true" />
        Open Substrate
      </a>
    </Button>
  );
  const continueInBrowser = (primary: boolean) => (
    <Button asChild size="lg" variant={primary ? "default" : "outline"}>
      <Link {...browserLink}>Continue in browser</Link>
    </Button>
  );

  let title = "Get the desktop app";
  let description = "Install Substrate for Windows, then sign in with the same account.";
  if (!loading && !error && !windowsAvailable) {
    title = "The Windows app is coming soon";
    description = "Keep working in your browser for now. If you already have the app, open it.";
  }

  const summary = loading ? (
    <Skeleton className="h-4 w-56" />
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
            <h2 id="desktop-install-title" className="text-sm font-semibold">
              {title}
            </h2>
            {summary}
          </div>
        </div>
      ) : (
        summary
      )}
      {error && (
        <ErrorState
          compact
          title="Couldn’t check for the installer"
          description="You can still open an installed app or continue in your browser."
          onRetry={onRetry}
        />
      )}
      <div className="flex flex-col gap-2">
        {windowsAvailable ? (
          <Button asChild size="lg">
            <a href="/desktop/download" rel="noreferrer">
              <Download aria-hidden="true" />
              Download for Windows
            </a>
          </Button>
        ) : (
          !loading && !error && continueInBrowser(true)
        )}
        {/* The two quieter paths share one row, so the primary action stands alone above them. */}
        <div className="flex gap-2 *:flex-1">
          {openInstalled}
          {(windowsAvailable || error) && continueInBrowser(false)}
        </div>
      </div>
    </section>
  );
}
