import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/auth-navigation";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formText } from "./form-values";

export function SignupForm({ redirect }: { redirect: string }) {
  const queryClient = useQueryClient();
  const signup = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signUp.email({
        name: formText(form, "name"),
        email,
        password: formText(form, "password"),
        callbackURL: authHref("/login", redirect, email),
      });
      if (result.error) throw new Error(result.error.message || "Could not create your account.");
      queryClient.clear();
      window.location.assign(authHref("/verify-email", redirect, email));
    },
  });
  return (
    <AuthFrame title="Create your account" description="A shared home for your team and its work.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          signup.mutate(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <FormMessage error={signup.error} />
        <Button className="w-full" disabled={signup.isPending}>
          {signup.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm">
        Already have an account?{" "}
        <a className="underline" href={authHref("/login", redirect)}>
          Sign in
        </a>
      </p>
    </AuthFrame>
  );
}
