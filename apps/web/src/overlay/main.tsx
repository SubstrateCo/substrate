import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createDemoBridge } from "./demo-bridge";
import { ScreenNotificationHost } from "@/components/screen-notifications/screen-notification-host";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { screenNotificationsBridge } from "@/lib/desktop/bridges";
import "../styles.css";

// The screen notification overlay: a transparent, always-on-top window with only the card stack.
// No router, session, or query client. The theme follows the system scheme, which main sets from
// the person's theme.

// In development, `?demo=1` shows sample cards in a plain browser. Production builds replace
// `import.meta.env.DEV` with false, so this branch and the demo module drop out of the bundle.
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");
const bridge = screenNotificationsBridge() ?? (demo ? createDemoBridge() : undefined);

if (bridge)
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <TooltipProvider delayDuration={350}>
          <ScreenNotificationHost bridge={bridge} />
        </TooltipProvider>
      </ThemeProvider>
    </StrictMode>,
  );
