import { Link } from "@tanstack/react-router";

import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthLink } from "@/components/auth/auth-link";
import { Button } from "@/components/ui/button";
import { useAuthLink } from "@/hooks/use-auth-href";

export function WelcomeScreen() {
  const authLink = useAuthLink();
  return (
    <AuthFrame
      title="Your team’s connected workspace"
      description="Create your account and workspace in the browser. Install the desktop app when you’re ready."
      footer={<AuthLink to="/download">Download the desktop app</AuthLink>}
    >
      <div className="grid gap-2">
        <Button asChild size="lg">
          <Link {...authLink("/signup", "/onboarding")}>Create account</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link {...authLink("/login", "/onboarding")}>Sign in</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Invited by a teammate? Open the link in your invitation email. You don’t need the app to
        join.
      </p>
    </AuthFrame>
  );
}
