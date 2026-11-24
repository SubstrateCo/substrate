import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useId, useRef, useState } from "react";

import { ConfirmDialog } from "../../feedback/confirm-dialog";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

export type InvitationRoleOption = {
  value: OrganizationRole;
  label: string;
  description: string;
};

// On wide screens the fields share one subgrid: labels, then controls, then errors and hints.
// The button sits on the control row, so an error under the email never moves it.
const subgridField = "min-w-0 @lg:row-span-3 @lg:grid @lg:grid-rows-subgrid";
const emailColumn = "@lg:col-span-6";
const roleColumn = "@lg:col-span-3";

export function InvitationForm({
  roles,
  sending,
  disabled,
  onInvite,
}: {
  /** The roles the viewer may invite with, starting with the default. Never empty. */
  roles: readonly InvitationRoleOption[];
  sending: boolean;
  disabled: boolean;
  onInvite: (email: string, role: OrganizationRole) => void;
}) {
  const id = useId();
  const inviteButton = useRef<HTMLButtonElement>(null);
  const [selectedRole, setRole] = useState<OrganizationRole>("member");
  // Owner invitations grant full control, so they are confirmed first.
  const [ownerInvite, setOwnerInvite] = useState<string>();
  const validation = useNativeValidation();
  const roleOption = roles.find((option) => option.value === selectedRole) ?? roles[0]!;
  const role = roleOption.value;
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
            placeholder="name@company.com"
            data-missing-message="Enter an email address to invite."
            required
          />
          <FieldError id={`${id}-email-error`}>{validation.errors[`${id}-email`]}</FieldError>
        </Field>
        <Field className={`${subgridField} ${roleColumn}`}>
          <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => {
              const option = roles.find((candidate) => candidate.value === value);
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
              {roles.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {/* Before the button in the DOM, so a stacked form keeps the hint under the role. */}
        <FieldDescription id={`${id}-role-description`} className="@lg:col-span-12 @lg:row-start-4">
          {roleOption.description}
        </FieldDescription>
        <PendingButton
          ref={inviteButton}
          className="@lg:col-span-3 @lg:col-start-10 @lg:row-start-2"
          disabled={disabled}
          pending={sending}
        >
          Send invitation
        </PendingButton>
      </form>
      {ownerInvite && (
        <ConfirmDialog
          title="Invite an owner?"
          description={`${ownerInvite} will have full control of this organization, including invitations, roles, and other owners.`}
          confirmLabel="Send owner invitation"
          pending={sending}
          onClose={() => setOwnerInvite(undefined)}
          onRestoreFocus={() => inviteButton.current?.focus()}
          onConfirm={() => {
            onInvite(ownerInvite, "owner");
            setOwnerInvite(undefined);
          }}
        />
      )}
    </>
  );
}
