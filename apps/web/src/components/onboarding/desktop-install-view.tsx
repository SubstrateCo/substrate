import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";

export function DesktopInstallView({
  openHref,
  windowsAvailable,
  loading,
  error,
  onRetry,
}: {
  openHref: string;
  windowsAvailable: boolean;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <section className="space-y-4" aria-labelledby="desktop-install-title">
      <header className="space-y-2">
        <h2 id="desktop-install-title" className="text-lg font-semibold">
          Continue in the desktop app
        </h2>
        <p className="text-sm text-muted-foreground">
          Install Startup OS for Windows, or open an existing installation.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        {windowsAvailable && (
          <Button asChild>
            <a href="/desktop/download" rel="noreferrer">
              Download for Windows
            </a>
          </Button>
        )}
        <Button asChild variant="outline">
          <a href={openHref} rel="noreferrer">
            Open Startup OS
          </a>
        </Button>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Checking desktop download…
        </p>
      )}
      {error && (
        <ErrorState
          compact
          title="Couldn’t check the download"
          description="You can still open an installed app. Try again to check the installer."
          onRetry={onRetry}
        />
      )}
      {!loading && !error && !windowsAvailable && (
        <p className="text-sm text-muted-foreground">
          The Windows installer is not available yet. You can return here later, or open an already
          installed app.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        After installing, return to this page and choose Open Startup OS. Sign in with the same
        account. If the app does not open, start it and try this link again.
      </p>
    </section>
  );
}
