import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthLink } from "@/components/auth/auth-link";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { useAuthLink } from "@/hooks/use-auth-href";

export function DownloadScreen({ destination }: { destination: string }) {
  const authLink = useAuthLink();
  return (
    <AuthFrame
      title="Substrate for desktop"
      description="Messages, docs, tasks, and agents for your team in one app."
      footer={
        <>
          New to Substrate?{" "}
          <AuthLink {...authLink("/signup", destination)}>Create account</AuthLink>
        </>
      }
    >
      <DesktopInstall destination={destination} browserLink={authLink("/login", destination)} />
    </AuthFrame>
  );
}
