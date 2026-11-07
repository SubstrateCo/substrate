import { useId, useState } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { InvitationRole } from "./invitation-manager-view";

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
  const validation = useNativeValidation();
  return (
    <form
      className="grid gap-4 lg:grid-cols-12 lg:items-end"
      onInvalidCapture={validation.onInvalid}
      onInputCapture={validation.onInput}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) {
          const email = new FormData(event.currentTarget).get("email");
          // SAFETY: This form's required email input supplies a text value.
          onInvite(email as string, role);
        }
      }}
    >
      <Field
        className="min-w-0 lg:col-span-6"
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
      <Field className="min-w-0 lg:col-span-3">
        <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
        <Select
          value={role}
          onValueChange={(value) => {
            if (value === "owner" || value === "admin" || value === "member") setRole(value);
          }}
        >
          <SelectTrigger id={`${id}-role`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <PendingButton
        className="lg:col-span-3"
        disabled={disabled}
        pending={sending}
        pendingLabel="Sending…"
      >
        Send invitation
      </PendingButton>
    </form>
  );
}
