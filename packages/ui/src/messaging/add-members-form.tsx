import { useState } from "react";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { FormMessage } from "../auth/form-message";

export function AddMembersForm({
  onSubmit,
  pending = false,
  error,
  onClose,
}: {
  onSubmit: (emails: string) => void;
  pending?: boolean;
  error?: Error | null;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState("");
  return (
    <form
      className="space-y-3 border-b bg-muted/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(emails);
      }}
    >
      <Label htmlFor="add-member-emails">Add people by exact email address</Label>
      <Input
        id="add-member-emails"
        placeholder="alex@company.com, sam@partner.com"
        value={emails}
        onChange={(event) => setEmails(event.target.value)}
        disabled={pending}
        required
      />
      <p className="text-xs text-muted-foreground">
        Include people from any workspace who already have an account.
      </p>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add people"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
