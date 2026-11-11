import { formText } from "../form-values";
import { SignupForm } from "@/components/auth/signup/signup-form-view";
import { authHref } from "@/lib/auth/browser-links";
import { useEmailSignup } from "@/queries/auth/mutations";

export function BrowserSignupForm({ redirect }: { redirect: string }) {
  const signup = useEmailSignup();
  return (
    <SignupForm
      pending={signup.isPending}
      error={signup.error}
      onSubmit={(form) => {
        const email = formText(form, "email");
        signup.mutate(
          {
            name: formText(form, "name"),
            email,
            password: formText(form, "password"),
            callbackURL: authHref("/login", redirect, email),
          },
          { onSuccess: () => window.location.assign(authHref("/verify-email", redirect, email)) },
        );
      }}
      loginHref={authHref("/login", redirect)}
    />
  );
}
