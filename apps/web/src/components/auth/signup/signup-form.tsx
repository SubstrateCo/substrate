import { DesktopSignIn } from "../desktop/desktop-sign-in";
import { BrowserSignupForm } from "./browser-signup-form";
import { isDesktop } from "@/lib/desktop/auth";

export function SignupForm({ redirect }: { redirect: string }) {
  if (isDesktop()) return <DesktopSignIn redirect={redirect} />;
  return <BrowserSignupForm redirect={redirect} />;
}
