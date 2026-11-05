import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPassword,
});
function ResetPassword() {
  return <ResetPasswordForm {...Route.useSearch()} />;
}
