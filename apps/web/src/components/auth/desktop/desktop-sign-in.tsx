import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { DesktopSignIn as DesktopSignInView } from "@/components/auth/desktop/desktop-sign-in-view";
import { safeRedirect } from "@/lib/auth/navigation";
import "@/lib/desktop/auth";
import { useDesktopSignIn } from "@/queries/auth/desktop-mutations";

export function DesktopSignIn({ redirect }: { redirect: string }) {
  const request = useDesktopSignIn();
  const client = useQueryClient();
  const router = useRouter();
  return (
    <DesktopSignInView
      pending={request.isPending && request.opening}
      waiting={request.isPending && !request.opening}
      error={request.error}
      failed={request.isError}
      onSignIn={() => {
        request.mutate(undefined, {
          onSuccess: () => {
            client.clear();
            return router.navigate({ href: safeRedirect(redirect) });
          },
        });
      }}
    />
  );
}
