import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/lib/auth-navigation";
import { SignupForm } from "@/components/auth/signup-form";

export const Route = createFileRoute("/signup")({ validateSearch: authSearch, component: Signup });
function Signup() {
  return <SignupForm {...Route.useSearch()} />;
}
