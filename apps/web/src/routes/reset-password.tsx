import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/lib/auth-navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const Route = createFileRoute("/reset-password")({
  validateSearch: authSearch,
  component: ResetPassword,
});
function ResetPassword() {
  return <ResetPasswordForm {...Route.useSearch()} />;
}
