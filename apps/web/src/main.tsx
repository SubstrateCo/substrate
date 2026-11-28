import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "./router";
import { DesktopFrame } from "@/components/desktop/desktop-frame";
import { ScrollbarVisibility } from "@/components/scroll/scrollbar-visibility";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { schemaIssueMessage } from "@/lib/forms/validation-messages";
import { z } from "zod";
import "./styles.css";

z.config({ customError: schemaIssueMessage });

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScrollbarVisibility />
    <QueryClientProvider client={router.options.context.queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={350}>
          <DesktopFrame>
            <ShortcutsProvider>
              <RouterProvider router={router} />
            </ShortcutsProvider>
            <Toaster position="bottom-right" closeButton />
          </DesktopFrame>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
