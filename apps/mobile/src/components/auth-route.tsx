import { AuthScreen } from "@/components/auth";
import { authModeForPath } from "@/features/auth/navigation";
import { firstParam } from "@/lib/navigation";
import { router, useLocalSearchParams, usePathname } from "expo-router";

export function AuthRoute() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    token?: string;
    email?: string;
    invitationId?: string;
    destination?: string;
    error?: string;
  }>();
  return (
    <AuthScreen
      mode={authModeForPath(pathname) ?? "login"}
      token={firstParam(params.token)}
      email={firstParam(params.email)}
      invitationId={firstParam(params.invitationId)}
      destination={firstParam(params.destination)}
      error={firstParam(params.error)}
      onAuthenticated={(destination) => {
        if (destination?.startsWith("/accept-invitation/")) {
          router.replace({
            pathname: "/accept-invitation/[invitationId]",
            params: { invitationId: destination.slice("/accept-invitation/".length) },
          });
        } else {
          if (destination?.startsWith("/?")) {
            router.replace({
              pathname: "/",
              params: Object.fromEntries(new URLSearchParams(destination.slice(2))),
            });
          } else {
            router.replace(destination === "/organizations" ? "/organizations" : "/");
          }
        }
      }}
      onModeChange={(mode, email) => {
        const paths = {
          login: "/login",
          forgot: "/forgot-password",
          reset: "/reset-password",
          verify: "/verify-email",
          invite: "/login",
        } as const;
        router.replace({
          pathname: paths[mode],
          params: {
            email,
            destination: firstParam(params.destination),
            invitationId: firstParam(params.invitationId),
          },
        });
      }}
    />
  );
}
