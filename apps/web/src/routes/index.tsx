import { createFileRoute, redirect } from "@tanstack/react-router";

import { WelcomeScreen } from "@/components/onboarding/welcome-screen";
import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";
import { isDesktop } from "@/lib/desktop/auth";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (isDesktop()) throw redirect({ to: "/dashboard" });
  },
  component: Welcome,
});

function Welcome() {
  return (
    <NonWorkspaceLayout>
      <WelcomeScreen />
    </NonWorkspaceLayout>
  );
}
