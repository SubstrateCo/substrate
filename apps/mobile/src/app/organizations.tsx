import { authClient } from "@/api/auth-client";
import { AuthScreen, WorkspacePicker } from "@/components/auth";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { router } from "expo-router";

export default function OrganizationsRoute() {
  const current = authClient.useSession();
  if (current.isPending) return <LoadingScreen />;
  if (!current.data) return <AuthScreen onAuthenticated={() => current.refetch()} />;
  if (!current.data.user.emailVerified)
    return <AuthScreen mode="verify" email={current.data.user.email} />;
  return <WorkspacePicker onSelect={() => router.replace("/")} />;
}
