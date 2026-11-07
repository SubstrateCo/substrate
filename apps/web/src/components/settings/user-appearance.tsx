import { AppearanceControl } from "../theme/appearance-control";

export function UserAppearance() {
  return (
    <section className="space-y-3 py-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Display preferences</h2>
        <p className="text-sm text-muted-foreground">
          Choose a theme for this device. This does not change your organization's settings.
        </p>
      </div>
      <AppearanceControl />
    </section>
  );
}
