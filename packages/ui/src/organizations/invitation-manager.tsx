import { useState } from "react";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { FormMessage } from "../auth/form-message";
import { InvitationTable } from "./invitation-table";

export type InvitationRole = "owner" | "admin" | "member";
export type InvitationListItem = {
  id: string;
  email: string;
  role: InvitationRole;
  status: string;
  expired: boolean;
  expiresAt: Date | string;
};

export function InvitationManager({
  invitations,
  loading = false,
  sending = false,
  canceling = false,
  error,
  message,
  failed = false,
  onRetry,
  onInvite,
  onCancel,
}: {
  invitations?: InvitationListItem[];
  loading?: boolean;
  sending?: boolean;
  canceling?: boolean;
  error?: Error | null;
  message?: string;
  failed?: boolean;
  onRetry: () => void;
  onInvite: (email: string, role: InvitationRole, resend?: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const [role, setRole] = useState<InvitationRole>("member");
  const [email, setEmail] = useState("");
  const busy = sending || canceling;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite your team</CardTitle>
        <CardDescription>Only workspace owners can send and manage invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <form
            className="grid gap-4 sm:grid-cols-12 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              onInvite(email, role);
            }}
          >
            <div className="grid min-w-0 gap-2 sm:col-span-6">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="teammate@company.com"
                required
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:col-span-3">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (value === "owner" || value === "admin" || value === "member") setRole(value);
                }}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="sm:col-span-3" disabled={busy}>
              {sending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
          <FormMessage error={failed ? null : error} message={message} floating />
          <section className="min-h-48 space-y-3">
            <h3 className="text-sm font-medium">Invitations</h3>
            <InvitationTable
              invitations={invitations}
              loading={loading}
              error={failed ? error : null}
              busy={busy}
              onRetry={onRetry}
              onInvite={onInvite}
              onCancel={onCancel}
            />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
