import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseRecipientEmails } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { addMembers } from "@/server/messaging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";

export function AddMembersForm({
  organizationId,
  conversationId,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState("");
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: async () => {
      const recipients = parseRecipientEmails(emails);
      if (!recipients.length) throw new Error("Enter at least one email address.");
      return addMembers({ data: { organizationId, conversationId, emails: recipients } });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <form
      className="space-y-3 border-b bg-muted/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(undefined, { onSuccess: () => onClose() });
      }}
    >
      <Label htmlFor="add-member-emails">Add people by exact email address</Label>
      <Input
        id="add-member-emails"
        placeholder="alex@company.com, sam@partner.com"
        value={emails}
        onChange={(event) => setEmails(event.target.value)}
        disabled={add.isPending}
        required
      />
      <p className="text-xs text-muted-foreground">
        Include people from any workspace who already have an account.
      </p>
      <FormMessage error={add.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add people"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
