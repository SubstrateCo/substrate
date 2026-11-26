import { useMutation, useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { authClient } from "@/api/auth-client";
import { useAuth } from "@/auth/provider";
import { AuthScreen, WorkspacePicker } from "@/components/auth";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { WorkspaceContent } from "@/components/layout/workspace-content";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { authDestination } from "@/features/auth/navigation";
import { firstParam } from "@/lib/navigation";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function WorkspaceRoute() {
  const current = authClient.useSession();
  const auth = useAuth();
  const params = useLocalSearchParams<{
    workspaceId?: string;
    conversationId?: string;
    messageId?: string;
    record?: string;
    tab?: string;
  }>();
  const linkedWorkspace = firstParam(params.workspaceId);
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const organizationId = current.data?.session.activeOrganizationId;
  const organizations = useQuery({
    queryKey: ["account", current.data?.user.id, "organizations"],
    enabled: !!current.data?.user.emailVerified,
    queryFn: async () => {
      const result = await authClient.organization.list();
      if (result.error) throw new Error(result.error.message ?? "Couldn’t load your workspaces.");
      return result.data;
    },
  });
  const switchWorkspace = useMutation({
    mutationFn: (id: string) => auth.setActiveOrganization(id),
  });

  if (current.isPending || auth.isPending) return <LoadingScreen label="Checking your session…" />;
  if (current.error) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background px-6">
        <Text className="text-xl font-semibold">Couldn’t connect</Text>
        <Text className="text-muted-foreground">
          Your session could not be checked. Check your connection and try again.
        </Text>
        <Button onPress={() => current.refetch()}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }
  if (!current.data) {
    const continuation = new URLSearchParams();
    for (const name of ["workspaceId", "conversationId", "messageId", "record", "tab"] as const) {
      const value = firstParam(params[name]);
      if (value) continuation.set(name, value);
    }
    const destination = authDestination(continuation.size ? `/?${continuation}` : "/");
    return <Redirect href={{ pathname: "/login", params: { destination } }} />;
  }
  if (!current.data.user.emailVerified) {
    return (
      <AuthScreen
        mode="verify"
        email={current.data.user.email}
        onAuthenticated={() => router.replace("/")}
      />
    );
  }
  if (!organizationId || choosingWorkspace) {
    return (
      <WorkspacePicker
        onSelect={() => {
          setChoosingWorkspace(false);
          router.replace("/");
        }}
      />
    );
  }
  if (linkedWorkspace && linkedWorkspace !== organizationId) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background px-6">
        <Text className="text-xl font-semibold">Open another workspace?</Text>
        <Text className="text-muted-foreground">
          This link belongs to another workspace. Switch workspaces to check your access.
        </Text>
        {switchWorkspace.error && (
          <Text className="text-destructive">{switchWorkspace.error.message}</Text>
        )}
        <Button
          disabled={switchWorkspace.isPending}
          onPress={() => switchWorkspace.mutate(linkedWorkspace)}
        >
          <Text>{switchWorkspace.isPending ? "Switching…" : "Switch workspace"}</Text>
        </Button>
        <Button variant="ghost" onPress={() => router.replace("/")}>
          <Text>Stay here</Text>
        </Button>
      </View>
    );
  }
  const workspace = organizations.data?.find((item) => item.id === organizationId);
  return (
    <WorkspaceContent
      key={`${current.data.user.id}:${organizationId}`}
      organizationId={organizationId}
      userId={current.data.user.id}
      workspaceName={workspace?.name ?? "Workspace"}
      onWorkspaceMenu={() => setChoosingWorkspace(true)}
    />
  );
}
