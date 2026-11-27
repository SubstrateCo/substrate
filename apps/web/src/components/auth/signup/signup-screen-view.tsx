import type { ReactNode } from "react";

import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import type { authLink } from "@/lib/auth/navigation";

type SignupScreenProps = {
  loginLink: ReturnType<typeof authLink>;
  children: ReactNode;
};

export function SignupScreen({ loginLink, children }: SignupScreenProps) {
  return (
    <AuthFrame
      title="Create your account"
      description="A shared home for your team and its work."
      footer={
        <>
          Already have an account? <AuthLink {...loginLink}>Sign in</AuthLink>
        </>
      }
    >
      {children}
    </AuthFrame>
  );
}

export function InvitationSignupScreen({ loginLink, children }: SignupScreenProps) {
  return (
    <AuthFrame
      title="Create an account to join your team"
      description="Use the email address that received the invitation. After you verify your email and sign in, you can accept it."
      footer={
        <>
          Already have an account? <AuthLink {...loginLink}>Sign in</AuthLink>
        </>
      }
    >
      {children}
    </AuthFrame>
  );
}
