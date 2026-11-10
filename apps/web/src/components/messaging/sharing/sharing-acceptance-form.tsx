import type { getSharingInvitation } from "@/api/messaging/sharing";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SharingAcceptanceForm({
  invitation,
  organizations,
  organizationId,
  confirmed,
  busy,
  onOrganization,
  onConfirmed,
  onAccept,
  onDecline,
}: {
  invitation: Awaited<ReturnType<typeof getSharingInvitation>>;
  organizations: { id: string; name: string }[];
  organizationId: string;
  confirmed: boolean;
  busy: boolean;
  onOrganization: (id: string) => void;
  onConfirmed: (value: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="space-y-4">
      <p>
        <strong>{invitation.hostName}</strong> invited you to{" "}
        <strong>{invitation.name ?? "a conversation"}</strong>.
      </p>
      <p className="text-sm text-muted-foreground">Invited email: {invitation.email}</p>
      <p className="text-sm">
        {invitation.purpose === "organization"
          ? "An owner or admin must approve for your organization. Other members can request approval."
          : "Only you are invited. Other members of your organization do not receive access."}
      </p>
      <Field>
        <FieldLabel htmlFor="sharing-organization">Your organization</FieldLabel>
        <Select
          value={organizationId}
          onValueChange={onOrganization}
          disabled={busy || !!invitation.targetOrganizationId}
        >
          <SelectTrigger id="sharing-organization">
            <SelectValue placeholder="Choose your organization" />
          </SelectTrigger>
          <SelectContent>
            {organizations
              .filter((org) => org.id !== invitation.hostOrganizationId)
              .map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <a
        className="block text-sm underline"
        href={`/onboarding?${new URLSearchParams({ redirect: `/accept-sharing/${invitation.id}` })}`}
      >
        Create an organization
      </a>
      <Field orientation="horizontal">
        <Checkbox
          id="accept-sharing-history"
          checked={confirmed}
          onCheckedChange={(value) => onConfirmed(value === true)}
          disabled={busy}
        />
        <FieldLabel htmlFor="accept-sharing-history">
          I understand that participants can read the full conversation history. Linked private
          records are not shared.
        </FieldLabel>
      </Field>
      <div className="flex flex-wrap gap-3">
        <PendingButton
          pending={busy}
          pendingLabel="Saving…"
          disabled={!organizationId || !confirmed}
          onClick={onAccept}
        >
          Accept invitation
        </PendingButton>
        <Button variant="outline" disabled={busy} onClick={onDecline}>
          Decline invitation
        </Button>
      </div>
    </div>
  );
}
