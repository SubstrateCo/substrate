import { createFileRoute } from "@tanstack/react-router";
import { requireVerifiedSession } from "@/queries/auth/session";
import { OrganizationSelection } from "@/components/organizations/organization-selection";

export const Route = createFileRoute("/organizations")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireVerifiedSession(context.queryClient, "/organizations");
  },
  component: OrganizationSelection,
});
