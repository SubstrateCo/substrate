import { createFileRoute } from "@tanstack/react-router";

import { redirectAuthenticatedSession } from "@/queries/auth/session";

export const Route = createFileRoute("/_public/_guest")({
  ssr: false,
  beforeLoad: async ({ context, search }) => {
    if (search.client_id === "electron" && search.state && search.code_challenge) return;
    await redirectAuthenticatedSession(context.queryClient, search.redirect);
  },
});
