import { formText } from "../form-values";
import { ResetPasswordForm as ResetPasswordFormView } from "@/components/auth/password/reset-password-form-view";
import { useAuthLink } from "@/hooks/use-auth-href";
import { useResetPassword } from "@/queries/auth/mutations";

export function ResetPasswordForm({
  token,
  error,
  redirect,
}: {
  token: string;
  error: string;
  redirect: string;
}) {
  const reset = useResetPassword(token);
  const authLink = useAuthLink();
  return (
    <ResetPasswordFormView
      invalid={!token || Boolean(error)}
      pending={reset.isPending}
      success={reset.isSuccess}
      error={reset.error}
      onSubmit={(form) => reset.mutate(formText(form, "password"))}
      loginLink={authLink("/login", redirect)}
      requestResetLink={authLink("/forgot-password", redirect)}
    />
  );
}
