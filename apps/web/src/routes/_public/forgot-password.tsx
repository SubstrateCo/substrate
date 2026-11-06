import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const Route = createFileRoute("/_public/forgot-password")({
  component: ForgotPassword,
});
function ForgotPassword() {
  return <ForgotPasswordForm {...Route.useSearch()} />;
}
