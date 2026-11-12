import { DesktopSignIn as DesktopSignInView } from "@/components/auth/desktop/desktop-sign-in-view";
import { safeRedirect } from "@/lib/auth/navigation";
import "@/lib/desktop/auth";
import { useDesktopSignIn } from "@/queries/auth/desktop-mutations";

export function DesktopSignIn({ redirect }: { redirect: string }) {
  const request = useDesktopSignIn();
  return (
    <DesktopSignInView
      pending={request.isPending && request.opening}
      waiting={request.isPending && !request.opening}
      error={request.error}
      failed={request.isError}
      onSignIn={() => {
        request.mutate(undefined, {
          onSuccess: () => window.location.assign(safeRedirect(redirect)),
        });
      }}
    />
  );
}
