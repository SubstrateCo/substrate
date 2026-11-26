import type { HarnessAuthMethod } from "@substrate/contracts/harness-runtime";

import { SettingsNote } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogIn, LogOut } from "lucide-react";

export type HarnessAccountState =
  | { kind: "hidden" }
  | { kind: "sign-in"; methods: HarnessAuthMethod[] }
  | { kind: "signed-in"; signOut: boolean };

/**
 * Sign in with the agent's only method, or choose one of several. Primary inside the model picker,
 * outline beside other settings.
 */
function SignInButton({
  label,
  methods,
  disabled,
  size = "xs",
  variant = "outline",
  onSignIn,
}: {
  label: string;
  methods: HarnessAuthMethod[];
  disabled?: boolean;
  size?: "xs" | "sm";
  variant?: "outline" | "default";
  onSignIn: (method: HarnessAuthMethod) => void;
}) {
  const [only] = methods;
  if (methods.length === 1)
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        className="w-fit"
        disabled={disabled}
        onClick={() => onSignIn(only)}
      >
        <LogIn aria-hidden="true" />
        Connect {label}
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size={size} variant={variant} className="w-fit" disabled={disabled}>
          <LogIn aria-hidden="true" />
          Connect {label}
          <ChevronDown aria-hidden="true" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {methods.map((method) => (
          <DropdownMenuItem key={method.id} onSelect={() => onSignIn(method)}>
            {method.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** In the model picker, in place of the model list of a harness that needs sign-in. */
export function PickerSignIn({
  label,
  methods,
  onSignIn,
}: {
  label: string;
  methods: HarnessAuthMethod[];
  /** Absent outside the desktop app. */
  onSignIn?: (method: HarnessAuthMethod) => void;
}) {
  return (
    <div className="grid gap-3 p-4">
      <div className="flex items-start gap-3">
        <LogIn aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-medium">Connect your {label} account</p>
          <p className="text-xs text-muted-foreground">Its models appear here once connected.</p>
        </div>
      </div>
      {onSignIn && methods.length > 0 ? (
        <div className="pl-7">
          <SignInButton
            label={label}
            methods={methods}
            size="sm"
            variant="default"
            onSignIn={onSignIn}
          />
        </div>
      ) : (
        <p className="pl-7 text-xs text-muted-foreground">
          Sign in with the {label} CLI, then refresh.
        </p>
      )}
    </div>
  );
}

/** The agent's sign-in on this desktop, under the model picker. */
export function HarnessAccountView({
  label,
  state,
  busy,
  onSignIn,
  onSignOut,
}: {
  label: string;
  state: HarnessAccountState;
  busy: boolean;
  onSignIn: (method: HarnessAuthMethod) => void;
  onSignOut: () => void;
}) {
  if (state.kind === "hidden") return null;
  if (state.kind === "signed-in")
    return state.signOut ? (
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{label} account connected</span>
        <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          Disconnect
        </Button>
      </div>
    ) : null;
  return (
    <SettingsNote>
      <div className="grid gap-2">
        <p>Connect your {label} account so this agent can run.</p>
        {state.methods.length > 0 ? (
          <SignInButton label={label} methods={state.methods} disabled={busy} onSignIn={onSignIn} />
        ) : (
          <p>Sign in with the {label} CLI, then refresh.</p>
        )}
      </div>
    </SettingsNote>
  );
}
