import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { FormMessage } from "../auth/form-message";

export function CreateOrganizationForm({
  pending = false,
  error,
  onSubmit,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="organization-name">Workspace name</Label>
        <Input id="organization-name" name="name" placeholder="Your company" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="organization-slug">Workspace slug</Label>
        <Input
          id="organization-slug"
          name="slug"
          placeholder="your-company"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="Use lowercase letters, numbers, and single hyphens between words."
          required
        />
        <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens.</p>
      </div>
      <FormMessage error={error} />
      <Button disabled={pending}>{pending ? "Creating…" : "Create workspace"}</Button>
    </form>
  );
}
