import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesheet from "../styles.css?url";
import { NotFound } from "@startup-os/ui/feedback/not-found";
import { RouteErrorScreen } from "@/components/feedback/route-error-screen";
import { ThemeProvider } from "@startup-os/ui/theme/theme-provider";
import { ThemeSwitcher } from "@startup-os/ui/theme/theme-switcher";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Startup OS" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: Root,
  notFoundComponent: () => <NotFound homeLink={<Link to="/">Return home</Link>} />,
  errorComponent: RouteErrorScreen,
});

function Root() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <Outlet />
          <div
            className="fixed right-4 top-4 z-40 rounded-lg bg-popover shadow-surface"
            data-theme-control
          >
            <ThemeSwitcher />
          </div>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
