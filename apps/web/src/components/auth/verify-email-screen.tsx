import { useMutation } from "@tanstack/react-query";
import { VerifyEmailScreen as VerifyEmailScreenView } from "@startup-os/ui/auth/verify-email-screen";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/browser-auth-links";
import { formText } from "./form-values";

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
      success={resend.isSuccess}
      error={resend.error}
      onSubmit={(form) => resend.mutate(form)}
      loginHref={authHref("/login", redirect, email)}
    />
  );
}
