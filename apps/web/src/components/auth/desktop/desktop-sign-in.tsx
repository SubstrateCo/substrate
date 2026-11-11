import { DesktopSignIn as DesktopSignInView } from "@/components/auth/desktop/desktop-sign-in-view";
import { safeRedirect } from "@/lib/auth/navigation";
import "@/lib/desktop/auth";
import { useDesktopSignIn, useDesktopSignInResult } from "@/queries/auth/desktop-mutations";

export function DesktopSignIn({ redirect }: { redirect: string }) {
  const request = useDesktopSignIn();
  const result = useDesktopSignInResult();
  return (
    <DesktopSignInView
      pending={request.isPending}
      waiting={result.isPending}
      error={result.error ?? request.error}
      failed={result.isError}
      onSignIn={() => {
        if (result.isError) result.reset();
        request.mutate(undefined, {
          // Opening the browser again keeps waiting for the same sign-in.
          onSuccess: () => {
            if (!result.isPending)
              result.mutate(undefined, {
                onSuccess: () => window.location.assign(safeRedirect(redirect)),
              });
          },
        });
      }}
    />
  );
}
