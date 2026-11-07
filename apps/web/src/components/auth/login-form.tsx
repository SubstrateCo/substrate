import { DesktopSignIn } from "./desktop-sign-in";
import { BrowserLoginForm } from "./login-form/browser-login-form";
import { isDesktop } from "@/lib/desktop-auth";

export function LoginForm({ redirect, email = "" }: { redirect: string; email?: string }) {
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <BrowserLoginForm redirect={redirect} email={email} />;
}
