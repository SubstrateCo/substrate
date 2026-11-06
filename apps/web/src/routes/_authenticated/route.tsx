import { createFileRoute } from "@tanstack/react-router";

import { requireVerifiedSession } from "@/queries/auth/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => ({
    session: await requireVerifiedSession(context.queryClient, location.href),
  }),
});
