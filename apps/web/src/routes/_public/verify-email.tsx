import { createFileRoute } from "@tanstack/react-router";

import { VerifyEmailScreen } from "@/components/auth/verify-email-screen";

export const Route = createFileRoute("/_public/verify-email")({
  component: VerifyEmail,
});
function VerifyEmail() {
  return <VerifyEmailScreen {...Route.useSearch()} />;
}
