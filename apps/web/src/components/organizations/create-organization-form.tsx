import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { unwrap } from "@/queries/organizations/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";
import { formText } from "@/components/auth/form-values";

export function CreateOrganizationForm() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const organization = unwrap(
        await authClient.organization.create({
          name: formText(form, "name").trim(),
          slug: formText(form, "slug").trim(),
        }),
      );
      unwrap(await authClient.organization.setActive({ organizationId: organization.id }));
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(new FormData(event.currentTarget));
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
      <FormMessage error={create.error} />
      <Button disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
