import { authClient } from "@/api/auth-client";
import { AuthScreen, WorkspacePicker } from "@/components/auth";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { firstParam } from "@/lib/navigation";
import { router, useLocalSearchParams } from "expo-router";

export default function InvitationRoute() {
  const current = authClient.useSession();
  const params = useLocalSearchParams<{ invitationId: string }>();
  const invitationId = firstParam(params.invitationId);
  if (current.isPending) return <LoadingScreen />;
  if (!current.data) return <AuthScreen mode="invite" invitationId={invitationId} />;
  if (!current.data.user.emailVerified) {
    return <AuthScreen mode="verify" email={current.data.user.email} invitationId={invitationId} />;
  }
  return <WorkspacePicker invitationId={invitationId} onSelect={() => router.replace("/")} />;
}
