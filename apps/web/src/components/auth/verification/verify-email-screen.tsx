import { useMutation } from "@tanstack/react-query";

import { formText } from "../form-values";
import { VerifyEmailScreen as VerifyEmailScreenView } from "@/components/auth/verification/verify-email-screen-view";
import { authHref } from "@/lib/auth/browser-links";
import { authClient } from "@/lib/auth/client";

export function VerifyEmailScreen({
  redirect,
  email,
  error,
}: {
  redirect: string;
  email: string;
  error: string;
}) {
  const resend = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: authHref("/login", redirect, email),
      });
      if (result.error)
        throw new Error(result.error.message || "Could not send verification email.");
    },
  });
  return (
    <VerifyEmailScreenView
      email={email}
      invalid={Boolean(error)}
      pending={resend.isPending}
      sentTo={resend.isSuccess ? formText(resend.variables, "email") : undefined}
      error={resend.error}
      onSubmit={(form) => resend.mutate(form)}
      onReset={() => resend.reset()}
      loginHref={authHref("/login", redirect, email)}
    />
  );
}
