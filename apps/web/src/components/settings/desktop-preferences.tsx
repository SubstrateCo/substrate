import type {} from "@startup-os/contracts/desktop/window";

import { useEffect, useState } from "react";

import { Field, FieldContent, FieldDescription, FieldLabel } from "../ui/field";
import { Switch } from "../ui/switch";
import { toast } from "sonner";

// Only the desktop app has this bridge. Browsers show nothing.
export function DesktopPreferences() {
  const bridge = window.startupOSDesktopSettings;
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    void bridge?.get().then(
      (settings) => {
        if (current) setLaunchAtLogin(settings.launchAtLogin);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [bridge]);
  if (!bridge) return null;
  return (
    <section className="space-y-3 py-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Desktop</h2>
        <p className="text-sm text-muted-foreground">
          Your agents run on this computer while Startup OS is open.
        </p>
      </div>
      <Field orientation="horizontal">
        <Switch
          id="desktop-launch-at-login"
          checked={launchAtLogin ?? false}
          disabled={launchAtLogin === undefined || saving}
          onCheckedChange={(enabled) => {
            setSaving(true);
            bridge
              .setLaunchAtLogin(enabled)
              .then((settings) => setLaunchAtLogin(settings.launchAtLogin))
              .catch(() => toast.error("We couldn’t change this setting. Try again."))
              .finally(() => setSaving(false));
          }}
        />
        <FieldContent>
          <FieldLabel htmlFor="desktop-launch-at-login">
            Open at login (runs agents in the background)
          </FieldLabel>
          <FieldDescription>
            Startup OS starts hidden in the tray when you sign in to this computer.
          </FieldDescription>
        </FieldContent>
      </Field>
    </section>
  );
}
