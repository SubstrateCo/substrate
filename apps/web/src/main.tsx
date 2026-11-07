import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "./router";
import { DesktopFrame } from "@/components/desktop/desktop-frame";
import { ScrollbarVisibility } from "@/components/scroll/scrollbar-visibility";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./styles.css";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScrollbarVisibility />
    <QueryClientProvider client={router.options.context.queryClient}>
      <ThemeProvider>
        <DesktopFrame>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" closeButton richColors />
        </DesktopFrame>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
