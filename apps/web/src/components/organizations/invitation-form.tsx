import { useId, useState } from "react";

import { PendingButton } from "../feedback/pending-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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
  return (
    <form
      className="grid gap-4 lg:grid-cols-12 lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) {
          const email = new FormData(event.currentTarget).get("email");
          // SAFETY: This form's required email input supplies a text value.
          onInvite(email as string, role);
        }
      }}
    >
      <div className="grid min-w-0 gap-2 lg:col-span-6">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="teammate@company.com"
          required
        />
      </div>
      <div className="grid min-w-0 gap-2 lg:col-span-3">
        <Label htmlFor={`${id}-role`}>Role</Label>
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
      </div>
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
