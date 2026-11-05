import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/lib/auth-navigation";
import { LoginForm } from "@/components/auth/login-form";

export const Route = createFileRoute("/login")({ validateSearch: authSearch, component: Login });
function Login() {
  return <LoginForm {...Route.useSearch()} />;
}
