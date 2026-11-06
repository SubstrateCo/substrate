import { useMutation, useQueryClient } from "@tanstack/react-query";

import { DesktopSignIn } from "./desktop-sign-in";
import { formText } from "./form-values";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/browser-auth-links";
import { isDesktop } from "@/lib/desktop-auth";
import { electronQuery } from "@/lib/electron-query";
import { SignupForm as SignupFormView } from "@/ui/auth/signup-form";

export function SignupForm({ redirect }: { redirect: string }) {
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <BrowserSignupForm redirect={redirect} />;
}

function BrowserSignupForm({ redirect }: { redirect: string }) {
  const queryClient = useQueryClient();
  const signup = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signUp.email({
        name: formText(form, "name"),
        email,
        password: formText(form, "password"),
        callbackURL: authHref("/login", redirect, email),
        fetchOptions: { query: electronQuery(window.location.search) },
      });
      if (result.error) throw new Error(result.error.message || "Could not create your account.");
      queryClient.clear();
      window.location.assign(authHref("/verify-email", redirect, email));
    },
  });
  return (
    <SignupFormView
      pending={signup.isPending}
      error={signup.error}
      onSubmit={(form) => signup.mutate(form)}
      loginHref={authHref("/login", redirect)}
    />
  );
}
