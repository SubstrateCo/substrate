import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "./router";
import { DesktopFrame } from "@/components/desktop/desktop-frame";
import { ScrollbarVisibility } from "@/components/scroll/scrollbar-visibility";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { schemaIssueMessage } from "@/lib/forms/validation-messages";
import { appHotkeys } from "@/lib/hotkeys/app-hotkeys";
import { z } from "zod";
import "./styles.css";

// Schema issues without their own message use product copy, never library text.
z.config({ customError: schemaIssueMessage });

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScrollbarVisibility />
    <QueryClientProvider client={router.options.context.queryClient}>
      <ThemeProvider>
        {/* Above the router, so root error and not-found screens keep tooltips. */}
        <TooltipProvider delayDuration={350}>
          <HotkeysProvider appHotkeys={appHotkeys}>
            <DesktopFrame>
              <RouterProvider router={router} />
              <Toaster position="bottom-right" closeButton />
            </DesktopFrame>
          </HotkeysProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
