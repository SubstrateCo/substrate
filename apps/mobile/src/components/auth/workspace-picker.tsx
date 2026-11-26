import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthField } from "./auth-field";
import { AuthFrame } from "./auth-frame";
import { AuthNotice } from "./auth-notice";
import { SubmitButton } from "./submit-button";
import { WorkspaceRow } from "./workspace-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/features/auth/result";
import type { WorkspacePickerProps } from "@/features/auth/types";
import { useWorkspaces } from "@/features/auth/use-workspaces";
import { Plus } from "lucide-react-native";

export function WorkspacePicker({ onSelect, invitationId }: WorkspacePickerProps) {
  const { organizations, invitations, invitation, action, leave } = useWorkspaces(
    onSelect,
    invitationId,
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [now, setNow] = useState(Date.now);
  const busy = action.isPending || leave.isPending;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const pendingInvitations = (invitations.data ?? []).filter(
    (item) =>
      item.status === "pending" &&
      new Date(item.expiresAt).getTime() > now &&
      item.id !== invitationId,
  );
  const requested = invitation.data;
  const requestedAvailable =
    requested?.status === "pending" && new Date(requested.expiresAt).getTime() > now;
  const opening = (kind: "select" | "accept", id: string) =>
    action.isPending && action.variables.kind === kind && action.variables.id === id;
  return (
    <AuthFrame
      title="Choose your workspace"
      description="Pick where you'd like to work, or make a space for your team."
    >
      <View className="gap-6">
        <AuthNotice message={action.error ? errorMessage(action.error) : undefined} />
        <AuthNotice message={leave.error ? errorMessage(leave.error) : undefined} />
        {invitationId ? (
          <View className="gap-3">
            <Text className="text-sm font-medium">Your invitation</Text>
            {invitation.isPending ? (
              <ActivityIndicator accessibilityLabel="Loading invitation" />
            ) : null}
            {invitation.error ? (
              <>
                <AuthNotice message={errorMessage(invitation.error)} />
                <Button variant="outline" onPress={() => void invitation.refetch()}>
                  <Text>Try again</Text>
                </Button>
              </>
            ) : null}
            {!invitation.error && requested && requestedAvailable ? (
              <WorkspaceRow
                name={requested.organizationName}
                detail={`Join as ${requested.role}`}
                invitation
                busy={opening("accept", requested.id)}
                disabled={busy}
                onPress={() => action.mutate({ kind: "accept", id: requested.id })}
              />
            ) : null}
            {!invitation.error && requested && !requestedAvailable ? (
              <AuthNotice message="This invitation has expired or is no longer available. Ask your team for a new invitation." />
            ) : null}
          </View>
        ) : null}
        <View className="gap-3">
          <Text className="text-sm font-medium">Your workspaces</Text>
          {organizations.isPending ? (
            <ActivityIndicator accessibilityLabel="Loading workspaces" />
          ) : null}
          {organizations.error ? (
            <>
              <AuthNotice message={errorMessage(organizations.error)} />
              <Button variant="outline" onPress={() => void organizations.refetch()}>
                <Text>Reload workspaces</Text>
              </Button>
            </>
          ) : null}
          {!organizations.error && organizations.data?.length === 0 ? (
            <Text className="text-sm leading-6 text-muted-foreground">
              No workspaces yet. Accept an invitation below or create your own.
            </Text>
          ) : null}
          {!organizations.error
            ? organizations.data?.map((organization) => (
                <WorkspaceRow
                  key={organization.id}
                  name={organization.name}
                  detail={organization.slug}
                  busy={opening("select", organization.id)}
                  disabled={busy}
                  onPress={() => action.mutate({ kind: "select", id: organization.id })}
                />
              ))
            : null}
        </View>
        {invitations.isPending || invitations.error || pendingInvitations.length > 0 ? (
          <View className="gap-3">
            <Text className="text-sm font-medium">Invitations</Text>
            {invitations.isPending ? (
              <ActivityIndicator accessibilityLabel="Loading invitations" />
            ) : null}
            {invitations.error ? (
              <>
                <AuthNotice message={errorMessage(invitations.error)} />
                <Button variant="outline" onPress={() => void invitations.refetch()}>
                  <Text>Reload invitations</Text>
                </Button>
              </>
            ) : (
              pendingInvitations.map((item) => (
                <WorkspaceRow
                  key={item.id}
                  name={item.organizationName}
                  detail={`Join as ${item.role}`}
                  invitation
                  busy={opening("accept", item.id)}
                  disabled={busy}
                  onPress={() => action.mutate({ kind: "accept", id: item.id })}
                />
              ))
            )}
          </View>
        ) : null}
        <View className="gap-4 border-t border-border pt-6">
          {creating ? (
            <>
              <AuthField
                label="Workspace name"
                value={name}
                onChangeText={setName}
                placeholder="Your team or company"
                maxLength={100}
                editable={!busy}
                autoCapitalize="words"
              />
              <SubmitButton
                label="Create workspace"
                busy={action.isPending && action.variables.kind === "create"}
                disabled={busy || !name.trim()}
                onPress={() => action.mutate({ kind: "create", name })}
              />
              <Button variant="ghost" disabled={busy} onPress={() => setCreating(false)}>
                <Text>Cancel</Text>
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="min-h-12 flex-row gap-2"
              disabled={busy}
              onPress={() => setCreating(true)}
            >
              <Icon as={Plus} size={18} className="text-primary" />
              <Text>Create a workspace</Text>
            </Button>
          )}
        </View>
        <Button
          variant="ghost"
          disabled={action.isPending || leave.isPending}
          onPress={() => leave.mutate()}
        >
          <Text>{leave.isPending ? "Signing out…" : "Sign out"}</Text>
        </Button>
      </View>
    </AuthFrame>
  );
}
