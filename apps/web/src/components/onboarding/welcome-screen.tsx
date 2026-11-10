import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { authHref } from "@/lib/auth/navigation";

export function WelcomeScreen() {
  return (
    <AuthFrame
      title="Your team’s connected workspace"
      description="Create your Startup OS account and organization in your browser. Install the desktop app when you’re ready to work."
    >
      <div className="grid gap-3">
        <Button asChild size="lg">
          <a href={authHref("/signup", "/onboarding")}>Create organization</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={authHref("/login", "/onboarding")}>Sign in</a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Invited by a teammate? Open the invitation link in your email. You do not need to install
        the app to join.
      </p>
      <a className="text-sm underline" href="/download">
        Download the desktop app
      </a>
    </AuthFrame>
  );
}
