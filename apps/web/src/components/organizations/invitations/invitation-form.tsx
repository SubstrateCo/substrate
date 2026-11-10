import { useId, useState } from "react";

import { ConfirmDialog } from "../../feedback/confirm-dialog";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { InvitationRole } from "./invitation-manager-view";
import { organizationRoles } from "@/lib/organizations/member-policy";

// On wide screens the fields share one subgrid: labels, then controls, then errors and hints.
// The button sits on the control row, so an error under the email never moves it.
const subgridField = "min-w-0 @lg:row-span-3 @lg:grid @lg:grid-rows-subgrid";
const emailColumn = "@lg:col-span-6";
const roleColumn = "@lg:col-span-3";

export function InvitationForm({
  sending,
  disabled,
  onInvite,
}: {
  sending: boolean;
  disabled: boolean;
  onInvite: (email: string, role: InvitationRole) => void;
}) {
  const id = useId();
  const [role, setRole] = useState<InvitationRole>("member");
  // Owner invitations grant full control, so they are confirmed first.
  const [ownerInvite, setOwnerInvite] = useState<string>();
  const validation = useNativeValidation();
  const roleOption = organizationRoles.find((option) => option.value === role)!;
  return (
    <>
      <form
        className="grid gap-4 @lg:grid-cols-12 @lg:gap-x-3 @lg:gap-y-2"
        onInvalidCapture={validation.onInvalid}
        onInputCapture={validation.onInput}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          // SAFETY: This form's required email input supplies a text value.
          const email = new FormData(event.currentTarget).get("email") as string;
          if (role === "owner") setOwnerInvite(email);
          else onInvite(email, role);
        }}
      >
        <Field
          className={`${subgridField} ${emailColumn}`}
          data-invalid={Boolean(validation.errors[`${id}-email`])}
        >
          <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
          <Input
            {...validation.inputProps(`${id}-email`)}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="teammate@company.com"
            required
          />
          <FieldError id={`${id}-email-error`}>{validation.errors[`${id}-email`]}</FieldError>
        </Field>
        <Field className={`${subgridField} ${roleColumn}`}>
          <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => {
              const option = organizationRoles.find((candidate) => candidate.value === value);
              if (option) setRole(option.value);
            }}
          >
            <SelectTrigger
              id={`${id}-role`}
              className="w-full"
              aria-describedby={`${id}-role-description`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizationRoles.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={`${id}-role-description`}>
            {roleOption.description}
          </FieldDescription>
        </Field>
        <PendingButton
          className="@lg:col-span-3 @lg:col-start-10 @lg:row-start-2"
          disabled={disabled}
          pending={sending}
          pendingLabel="Sending"
        >
          Send invitation
        </PendingButton>
      </form>
      {ownerInvite && (
        <ConfirmDialog
          title="Invite an owner?"
          description={`${ownerInvite} will have full control of this organization, including invitations, roles, and other owners.`}
          confirmLabel="Send owner invitation"
          pendingLabel="Sending"
          pending={sending}
          onClose={() => setOwnerInvite(undefined)}
          onConfirm={() => {
            onInvite(ownerInvite, "owner");
            setOwnerInvite(undefined);
          }}
        />
      )}
    </>
  );
}
