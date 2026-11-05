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

export type InvitationRole = "owner" | "admin" | "member";
export type InvitationListItem = {
  id: string;
  email: string;
  role: InvitationRole;
  status: string;
  expired: boolean;
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
      <CardContent className="space-y-6">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            onInvite(email, role);
          }}
        >
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                if (value === "owner" || value === "admin" || value === "member") setRole(value);
              }}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={busy}>{sending ? "Sending…" : "Send invitation"}</Button>
        </form>
        <FormMessage error={error} message={message} />
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Invitations</h3>
          {loading && <p role="status">Loading invitations…</p>}
          {failed && (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
          {invitations?.length === 0 && (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          )}
          <ul className="space-y-3">
            {invitations?.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role} · {invitation.status}
                    {invitation.expired ? " · expired" : ""}
                  </p>
                </div>
                {invitation.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        onInvite(invitation.email, invitation.role, true);
                      }}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onCancel(invitation.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
