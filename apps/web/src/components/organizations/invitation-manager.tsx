import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { invitationsQueryOptions } from "@/queries/organizations/options";
import { queryKeys } from "@/queries/keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/auth/form-message";
import { formText } from "@/components/auth/form-values";

type InvitationRole = "owner" | "admin" | "member";

export function InvitationManager({ organizationId }: { organizationId: string }) {
  const [role, setRole] = useState<InvitationRole>("member");
  const invitations = useQuery(invitationsQueryOptions(organizationId));
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
  const invite = useMutation({
    mutationFn: async ({
      email,
      role,
      resend = false,
    }: {
      email: string;
      role: InvitationRole;
      resend?: boolean;
    }) => {
      const result = await authClient.organization.inviteMember({
        organizationId,
        email,
        role,
        resend,
      });
      if (result.error) throw new Error(result.error.message || "Could not send the invitation.");
    },
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw new Error(result.error.message || "Could not cancel the invitation.");
    },
    onSuccess: refresh,
  });
  const busy = invite.isPending || cancel.isPending;
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
            const form = new FormData(event.currentTarget);
            invite.mutate({ email: formText(form, "email"), role });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
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
          <Button disabled={busy}>{invite.isPending ? "Sending…" : "Send invitation"}</Button>
        </form>
        <FormMessage
          error={invite.error || cancel.error || invitations.error}
          message={
            invite.isSuccess
              ? "Invitation email sent."
              : cancel.isSuccess
                ? "Invitation canceled."
                : undefined
          }
        />
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Invitations</h3>
          {invitations.isPending && <p role="status">Loading invitations…</p>}
          {invitations.isError && (
            <Button variant="outline" onClick={() => void invitations.refetch()}>
              Try again
            </Button>
          )}
          {invitations.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          )}
          <ul className="space-y-3">
            {invitations.data?.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role} · {invitation.status}
                    {new Date(invitation.expiresAt).getTime() < Date.now() ? " · expired" : ""}
                  </p>
                </div>
                {invitation.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        const invitationRole = invitation.role;
                        invite.mutate({
                          email: invitation.email,
                          role: invitationRole,
                          resend: true,
                        });
                      }}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => cancel.mutate(invitation.id)}
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
