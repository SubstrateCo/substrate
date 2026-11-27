import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { Button } from "@/components/ui/button";
import type { authLink } from "@/lib/auth/navigation";

type LoginScreenProps = {
  signupLink: ReturnType<typeof authLink>;
  children: ReactNode;
};

export function LoginScreen({ signupLink, children }: LoginScreenProps) {
  return (
    <AuthFrame
      title="Sign in"
      description="Open your Substrate workspace."
      footer={
        <>
          New to Substrate? <AuthLink {...signupLink}>Create account</AuthLink>
        </>
      }
    >
      {children}
    </AuthFrame>
  );
}

export function InvitationLoginScreen({ signupLink, children }: LoginScreenProps) {
  return (
    <AuthFrame
      title="Accept your invitation"
      description="New to Substrate? Create an account first, then verify your email to accept your invitation."
    >
      <div className="space-y-6">
        <Button asChild size="lg" className="w-full">
          <Link {...signupLink}>Create account to accept invitation</Link>
        </Button>
        <p className="text-sm text-muted-foreground">Already have an account? Sign in below.</p>
      </div>
      {children}
    </AuthFrame>
  );
}
