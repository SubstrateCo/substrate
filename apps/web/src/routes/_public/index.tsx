import { createFileRoute, redirect } from "@tanstack/react-router";

import { WelcomeScreen } from "@/components/onboarding/welcome-screen";
import { isDesktop } from "@/lib/desktop/auth";

export const Route = createFileRoute("/_public/")({
  beforeLoad: () => {
    if (isDesktop()) throw redirect({ to: "/messages" });
  },
  component: WelcomeScreen,
});
