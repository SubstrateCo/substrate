import { createFileRoute } from "@tanstack/react-router";

import { BrowserLoginForm } from "@/components/auth/login/browser-login-form";

export const Route = createFileRoute("/_public/_guest/login")({ component: Login });
function Login() {
  const { redirect, email } = Route.useSearch();
  return <BrowserLoginForm redirect={redirect} email={email} />;
}
