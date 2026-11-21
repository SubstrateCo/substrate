import { formText } from "../form-values";
import { ForgotPasswordForm as ForgotPasswordFormView } from "@/components/auth/password/forgot-password-form-view";
import { useAuthHref, useAuthLink } from "@/hooks/use-auth-href";
import { useRequestPasswordReset } from "@/queries/auth/mutations";

export function ForgotPasswordForm({ redirect }: { redirect: string }) {
  const authHref = useAuthHref();
  const authLink = useAuthLink();
  const reset = useRequestPasswordReset(authHref("/reset-password", redirect));
  return (
    <ForgotPasswordFormView
      pending={reset.isPending}
      success={reset.isSuccess}
      error={reset.error}
      onSubmit={(form) => reset.mutate(formText(form, "email"))}
      onReset={() => reset.reset()}
      loginLink={authLink("/login", redirect)}
    />
  );
}
