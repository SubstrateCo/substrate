import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesheet from "../styles.css?url";
import { Button } from "@/components/ui/button";

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
  notFoundComponent: () => (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p>Please try again.</p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </main>
  ),
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
