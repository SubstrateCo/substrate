import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "@/components/auth/login-form";

export const Route = createFileRoute("/_public/_guest/login")({ component: Login });
function Login() {
  return <LoginForm {...Route.useSearch()} />;
}
