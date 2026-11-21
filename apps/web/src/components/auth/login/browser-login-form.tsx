import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { BrowserElectronReturn } from "../desktop/browser-electron-return";
import { formText } from "../form-values";
import { LoginForm } from "@/components/auth/login/login-form-view";
import { useAuthHref, useAuthLink, useElectronAuthorization } from "@/hooks/use-auth-href";
import { safeRedirect } from "@/lib/auth/navigation";
import { useEmailLogin } from "@/queries/auth/mutations";
import { sessionQueryOptions } from "@/queries/auth/session";

export function BrowserLoginForm({ redirect, email }: { redirect: string; email: string }) {
  const query = useElectronAuthorization();
  const authHref = useAuthHref();
  const authLink = useAuthLink();
  const router = useRouter();
  // Only the desktop handoff returns early for an existing browser session.
  const session = useQuery({ ...sessionQueryOptions(), enabled: !!query });
  const login = useEmailLogin();
  if (query && (login.isSuccess || session.data?.user.emailVerified))
    return (
      <BrowserElectronReturn
        redirect={redirect}
        email={session.data?.user.email ?? login.variables?.email}
      />
    );
  return (
    <LoginForm
      email={email}
      pending={login.isPending}
      error={login.error}
      onSubmit={(form) =>
        login.mutate(
          {
            email: formText(form, "email"),
            password: formText(form, "password"),
            callbackURL: query ? authHref("/login", redirect) : safeRedirect(redirect),
            query,
          },
          {
            onSuccess: (result, input) => {
              if (result.verificationRequired) {
                return router.navigate(authLink("/verify-email", redirect, input.email));
              }
              if (!query) return router.navigate({ href: safeRedirect(redirect) });
            },
          },
        )
      }
      forgotPasswordLink={authLink("/forgot-password", redirect)}
      signupLink={authLink("/signup", redirect)}
    />
  );
}
