import { AuthFrame } from "@/components/auth/auth-frame";
import { DesktopInstall } from "@/components/onboarding/desktop-install";
import { authHref } from "@/lib/auth/navigation";

export function DownloadScreen({ destination }: { destination: string }) {
  return (
    <AuthFrame
      title="Get Startup OS"
      description="Set up your workspace in the browser, then continue on Windows."
    >
      <DesktopInstall destination={destination} />
      <div className="flex flex-wrap gap-4 text-sm">
        <a className="underline" href={authHref("/login", destination)}>
          Continue setup in browser
        </a>
        <a className="underline" href="/">
          Create an organization
        </a>
      </div>
    </AuthFrame>
  );
}
