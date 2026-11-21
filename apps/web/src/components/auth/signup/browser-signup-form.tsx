import { useRouter } from "@tanstack/react-router";

import { formText } from "../form-values";
import { SignupForm } from "@/components/auth/signup/signup-form-view";
import { useAuthHref, useAuthLink, useElectronAuthorization } from "@/hooks/use-auth-href";
import { useEmailSignup } from "@/queries/auth/mutations";

export function BrowserSignupForm({ redirect }: { redirect: string }) {
  const signup = useEmailSignup();
  const query = useElectronAuthorization();
  const authHref = useAuthHref();
  const authLink = useAuthLink();
  const router = useRouter();
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
            query,
          },
          { onSuccess: () => router.navigate(authLink("/verify-email", redirect, email)) },
        );
      }}
      loginLink={authLink("/login", redirect)}
    />
  );
}
