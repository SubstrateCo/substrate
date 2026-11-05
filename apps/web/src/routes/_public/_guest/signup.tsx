import { createFileRoute } from "@tanstack/react-router";
import { SignupForm } from "@/components/auth/signup-form";

export const Route = createFileRoute("/_public/_guest/signup")({ component: Signup });
function Signup() {
  return <SignupForm {...Route.useSearch()} />;
}
