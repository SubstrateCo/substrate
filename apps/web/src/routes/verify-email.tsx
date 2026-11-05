import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/lib/auth-navigation";
import { VerifyEmailScreen } from "@/components/auth/verify-email-screen";

export const Route = createFileRoute("/verify-email")({
  validateSearch: authSearch,
  component: VerifyEmail,
});
function VerifyEmail() {
  return <VerifyEmailScreen {...Route.useSearch()} />;
}
