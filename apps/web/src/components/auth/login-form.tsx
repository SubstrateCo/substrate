import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoginForm as LoginFormView } from "@/ui/auth/login-form";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/auth-navigation";
import { authHref } from "@/lib/browser-auth-links";
import { formText } from "./form-values";
import { isDesktop } from "@/lib/desktop-auth";
import { DesktopSignIn } from "./desktop-sign-in";
import { BrowserElectronReturn } from "./browser-electron-return";
import { electronQuery } from "@/lib/electron-query";

export function LoginForm({ redirect, email = "" }: { redirect: string; email?: string }) {
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <BrowserLoginForm redirect={redirect} email={email} />;
}

function BrowserLoginForm({ redirect, email }: { redirect: string; email: string }) {
  const queryClient = useQueryClient();
  const query = electronQuery(window.location.search);
  const session = authClient.useSession();
  const login = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signIn.email({
        email,
        password: formText(form, "password"),
        callbackURL: query ? authHref("/login", redirect) : safeRedirect(redirect),
        fetchOptions: { query },
      });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          window.location.assign(authHref("/verify-email", redirect, email));
          return;
        }
        throw new Error(result.error.message || "Could not sign in.");
      }
      queryClient.clear();
      if (query) return;
      window.location.assign(safeRedirect(redirect));
    },
  });
  if (query && (login.isSuccess || session.data?.user.emailVerified))
    return <BrowserElectronReturn />;
  return (
    <LoginFormView
      email={email}
      pending={login.isPending}
      error={login.error}
      onSubmit={(form) => login.mutate(form)}
      forgotPasswordHref={authHref("/forgot-password", redirect)}
      signupHref={authHref("/signup", redirect)}
    />
  );
}
