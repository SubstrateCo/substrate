import { formText } from "../form-values";
import { VerifyEmailScreen as VerifyEmailScreenView } from "@/components/auth/verification/verify-email-screen-view";
import { useAuthHref, useAuthLink } from "@/hooks/use-auth-href";
import { useSendVerificationEmail } from "@/queries/auth/mutations";

export function VerifyEmailScreen({
  redirect,
  email,
  error,
}: {
  redirect: string;
  email: string;
  error: string;
}) {
  const authHref = useAuthHref();
  const authLink = useAuthLink();
  const resend = useSendVerificationEmail((email) => authHref("/login", redirect, email));
  return (
    <VerifyEmailScreenView
      email={email}
      invalid={Boolean(error)}
      pending={resend.isPending}
      sentTo={resend.isSuccess ? resend.variables : undefined}
      error={resend.error}
      onSubmit={(form) => resend.mutate(formText(form, "email"))}
      onReset={() => resend.reset()}
      loginLink={authLink("/login", redirect, email)}
    />
  );
}
