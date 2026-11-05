import { createFileRoute } from "@tanstack/react-router";
import { redirectAuthenticatedSession } from "@/queries/auth/session";

export const Route = createFileRoute("/_public/_guest")({
  ssr: false,
  beforeLoad: async ({ context, search }) => {
    await redirectAuthenticatedSession(context.queryClient, search.redirect);
  },
});
