import type { SharingConfirmation } from "@substrate/contracts/messaging/sharing";

import { useState } from "react";
import { View } from "react-native";

import { PanelSheet } from "../shared/panel-sheet";
import { SharingDetailsView } from "./sharing-details-view";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { isEmailAddress } from "@/features/messaging/conversations/recipients";
import { useSharingAction, useSharingDetails } from "@/features/messaging/queries/use-sharing";
import { isAccessError } from "@/features/records/format";
import { SwitchField, TextField } from "@/features/records/ui/fields";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows, MutationError } from "@/features/records/ui/states";

const confirmCopy = {
  disconnect: {
    title: (name: string) => `Disconnect ${name}?`,
    description:
      "Everyone from this organization loses access to messages, search, and agent sources here. Its pending invitations are revoked. Their earlier messages stay. A new invitation is needed to reconnect.",
    confirm: "Remove access",
  },
  remove: {
    title: (name: string) => `Remove ${name}?`,
    description:
      "They lose access to messages, search, and agent sources here. Their earlier messages stay. A new invitation is needed to add them again.",
    confirm: "Remove access",
  },
  revoke: {
    title: (name: string) => `Revoke the invitation to ${name}?`,
    description: "The link in their email stops working. You can invite them again later.",
    confirm: "Revoke invitation",
  },
};

/** External collaboration for one conversation: invite with consent, and manage who has access. */
export function SharingSheet({
  organizationId,
  conversationId,
  name,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  name: string;
  onClose: () => void;
}) {
  const details = useSharingDetails(organizationId, conversationId);
  const action = useSharingAction(organizationId, conversationId);
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmation, setConfirmation] = useState<SharingConfirmation>();
  const [notice, setNotice] = useState<string>();
  const [openedAt] = useState(Date.now);
  const blocked = isAccessError(details.error);
  const data = blocked ? undefined : details.data;
  const emailError =
    submitted && !isEmailAddress(email) ? "Enter a complete email address." : undefined;
  const consentError =
    submitted && !confirmed
      ? "Confirm that invited people can read all earlier messages."
      : undefined;
  let hint = "They accept from their own organization before they get access.";
  if (data && !data.host) hint = "You can invite people from your own organization only.";
  else if (data?.kind === "channel")
    hint =
      "They accept from their own organization, and its admins must approve before they can read this channel.";

  const invite = () => {
    setSubmitted(true);
    setNotice(undefined);
    if (!isEmailAddress(email) || !confirmed) return;
    action.mutate(
      { kind: "invite", email: email.trim() },
      {
        onSuccess: () => {
          setNotice(`Invitation sent to ${email.trim()}.`);
          setEmail("");
          setSubmitted(false);
        },
      },
    );
  };

  return (
    <PanelSheet title={`External collaboration for ${name}`} onClose={onClose}>
      <Text className="text-sm text-muted-foreground">
        Work with people from other organizations. They see this conversation only, never your
        workspace or its private records.
      </Text>
      {details.isPending ? <LoadingRows rows={2} label="Loading sharing" /> : null}
      {details.error && !data ? (
        <ErrorState
          error={details.error}
          noun="sharing"
          onRetry={blocked ? undefined : () => void details.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <View className="gap-3">
            <TextField
              label="Invite by email"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="name@partner.com"
              description={hint}
              error={emailError}
              editable={!action.isPending}
            />
            <SwitchField
              label="I understand invited people can read all earlier messages"
              checked={confirmed}
              onChange={setConfirmed}
            />
            {consentError ? <Text className="text-xs text-destructive">{consentError}</Text> : null}
            {action.variables?.kind === "invite" ? <MutationError error={action.error} /> : null}
            {notice ? (
              <Text className="text-sm" accessibilityRole="alert">
                {notice}
              </Text>
            ) : null}
            <Button disabled={action.isPending || !confirmed} onPress={invite}>
              <Text>
                {action.isPending && action.variables.kind === "invite"
                  ? "Sending."
                  : "Send invitation"}
              </Text>
            </Button>
          </View>
          {details.error ? (
            <ErrorState
              compact
              error={details.error}
              noun="the latest sharing"
              onRetry={() => void details.refetch()}
            />
          ) : null}
          {action.variables?.kind === "resend" ? <MutationError error={action.error} /> : null}
          <SharingDetailsView
            details={data}
            organizationId={organizationId}
            now={openedAt}
            pending={action.isPending}
            onDisconnect={(id, orgName) =>
              setConfirmation({ kind: "disconnect", id, name: orgName })
            }
            onRemove={(id, person) => setConfirmation({ kind: "remove", id, name: person })}
            onResend={(id) =>
              action.mutate(
                { kind: "resend", id },
                { onSuccess: () => setNotice("Invitation email resent.") },
              )
            }
            onRevoke={(id, address) => setConfirmation({ kind: "revoke", id, name: address })}
          />
        </>
      ) : null}
      {confirmation ? (
        <ConfirmSheet
          title={confirmCopy[confirmation.kind].title(confirmation.name)}
          description={confirmCopy[confirmation.kind].description}
          confirmLabel={confirmCopy[confirmation.kind].confirm}
          destructive
          pending={action.isPending}
          error={action.variables?.kind === confirmation.kind ? action.error : null}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() =>
            action.mutate(
              { kind: confirmation.kind, id: confirmation.id },
              { onSuccess: () => setConfirmation(undefined) },
            )
          }
        />
      ) : null}
    </PanelSheet>
  );
}
