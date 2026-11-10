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
  browserHref,
  windowsAvailable,
  loading,
  error,
  onRetry,
}: {
  openHref: string;
  browserHref: string;
  windowsAvailable: boolean;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const openInstalled = (
    <Button asChild size="lg" variant="outline">
      <a href={openHref} rel="noreferrer">
        <ArrowUpRight aria-hidden="true" />
        Open Startup OS
      </a>
    </Button>
  );
  const continueInBrowser = (primary: boolean) => (
    <Button asChild size="lg" variant={primary ? "default" : "outline"}>
      <a href={browserHref}>Continue in browser</a>
    </Button>
  );

  let title = "Get the desktop app";
  let description = "Install Startup OS for Windows, then sign in with the same account.";
  if (!loading && !error && !windowsAvailable) {
    title = "The Windows app is coming soon";
    description = "Keep working in your browser for now. If you already have the app, open it.";
  }

  return (
    <section className="space-y-4" aria-labelledby="desktop-install-title" aria-busy={loading}>
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
          {loading ? (
            <Skeleton className="h-4 w-56" />
          ) : (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
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
