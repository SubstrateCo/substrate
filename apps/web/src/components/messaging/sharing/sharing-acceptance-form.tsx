import type { getSharingInvitation } from "@/api/messaging/sharing";
import { AuthLink } from "@/components/auth/auth-link";
import { FormMessage } from "@/components/feedback/form-message";
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
import { Globe } from "lucide-react";

export function SharingAcceptanceForm({
  invitation,
  organizations,
  organizationId,
  confirmed,
  busy,
  error,
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
  error?: Error | null;
  onOrganization: (id: string) => void;
  onConfirmed: (value: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border p-3 wrap-anywhere">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
        >
          <Globe className="size-4" />
        </span>
        <div className="min-w-0 space-y-1 text-sm">
          <p>
            <span className="font-medium">{invitation.hostName}</span> invited you to{" "}
            <span className="font-medium">{invitation.name ?? "a conversation"}</span>.
          </p>
          <p className="text-muted-foreground">Invited email: {invitation.email}</p>
          <p className="text-muted-foreground">
            {invitation.purpose === "organization"
              ? "An owner or admin must approve for your organization. Other members can request approval."
              : "Only you are invited. Other members of your organization don’t get access."}
          </p>
        </div>
      </div>
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="sharing-organization">Your organization</FieldLabel>
          {!invitation.targetOrganizationId && (
            <AuthLink
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
              href={`/onboarding?${new URLSearchParams({ redirect: `/accept-sharing/${invitation.id}` })}`}
            >
              Create an organization
            </AuthLink>
          )}
        </div>
        <Select
          value={organizationId}
          onValueChange={onOrganization}
          disabled={busy || !!invitation.targetOrganizationId}
        >
          <SelectTrigger id="sharing-organization" className="w-full">
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
      <Field orientation="horizontal" className="items-start">
        <Checkbox
          id="accept-sharing-history"
          className="mt-0.5"
          checked={confirmed}
          onCheckedChange={(value) => onConfirmed(value === true)}
          disabled={busy}
        />
        <FieldLabel htmlFor="accept-sharing-history">
          I understand that participants can read the full conversation history. Linked private
          records are not shared.
        </FieldLabel>
      </Field>
      <FormMessage error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onDecline}>
          Decline invitation
        </Button>
        <PendingButton
          pending={busy}
          pendingLabel="Saving."
          disabled={!organizationId || !confirmed}
          onClick={onAccept}
        >
          Accept invitation
        </PendingButton>
      </div>
    </div>
  );
}
