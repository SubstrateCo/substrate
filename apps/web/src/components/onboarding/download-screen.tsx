import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthLink } from "@/components/auth/auth-link";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { authHref } from "@/lib/auth/navigation";

export function DownloadScreen({ destination }: { destination: string }) {
  return (
    <AuthFrame
      title="Substrate for desktop"
      description="Messages, docs, tasks, and agents for your team in one app."
      footer={
        <>
          New to Substrate?{" "}
          <AuthLink href={authHref("/signup", destination)}>Create account</AuthLink>
        </>
      }
    >
      <DesktopInstall destination={destination} browserHref={authHref("/login", destination)} />
    </AuthFrame>
  );
}
