import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/lib/auth-navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: authSearch,
  component: ForgotPassword,
});
function ForgotPassword() {
  return <ForgotPasswordForm {...Route.useSearch()} />;
}
