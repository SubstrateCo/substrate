import { createFileRoute } from "@tanstack/react-router";

import { BrowserSignupForm } from "@/components/auth/signup/browser-signup-form";

export const Route = createFileRoute("/_public/_guest/signup")({ component: Signup });
function Signup() {
  const { redirect } = Route.useSearch();
  return <BrowserSignupForm redirect={redirect} />;
}
