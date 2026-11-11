import { formText } from "../form-values";
import { ResetPasswordForm as ResetPasswordFormView } from "@/components/auth/password/reset-password-form-view";
import { useAuthHref } from "@/hooks/use-auth-href";
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
  const authHref = useAuthHref();
  return (
    <ResetPasswordFormView
      invalid={!token || Boolean(error)}
      pending={reset.isPending}
      success={reset.isSuccess}
      error={reset.error}
      onSubmit={(form) => reset.mutate(formText(form, "password"))}
      loginHref={authHref("/login", redirect)}
      requestResetHref={authHref("/forgot-password", redirect)}
    />
  );
}
