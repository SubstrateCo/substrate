import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthLink } from "@/components/auth/auth-link";
import { Button } from "@/components/ui/button";
import { useAuthHref } from "@/hooks/use-auth-href";

export function WelcomeScreen() {
  const authHref = useAuthHref();
  return (
    <AuthFrame
      title="Your team’s connected workspace"
      description="Create your account and organization in the browser. Install the desktop app when you’re ready."
      footer={<AuthLink href="/download">Download the desktop app</AuthLink>}
    >
      <div className="grid gap-2">
        <Button asChild size="lg">
          <a href={authHref("/signup", "/onboarding")}>Create organization</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={authHref("/login", "/onboarding")}>Sign in</a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Invited by a teammate? Open the link in your invitation email. You don’t need the app to
        join.
      </p>
    </AuthFrame>
  );
}
