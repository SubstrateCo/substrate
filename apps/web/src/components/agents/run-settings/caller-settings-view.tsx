import type { AgentCallers, AgentCallerPolicy, AgentCallerView } from "@substrate/contracts/agents";

import { useState, type ReactNode } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { SettingsCard, SettingsFooter } from "@/components/layout/settings-section";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserMinus } from "lucide-react";

function CallerPolicyCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SettingsCard
      title="Who can call this agent"
      description="Calls from workspace members run with your full access. Your instructions still apply."
      footer={footer}
    >
      {children}
    </SettingsCard>
  );
}

function AllowedCallersCard({ children }: { children: ReactNode }) {
  return (
    <SettingsCard
      title="Allowed callers"
      description="These people skip approval when you choose Ask me first. Only me still blocks all callers."
    >
      {children}
    </SettingsCard>
  );
}

export function CallerSettingsLoading() {
  return (
    <div role="status" aria-label="Loading caller settings" className="grid gap-6">
      <div aria-hidden="true" className="grid gap-6">
        <CallerPolicyCard>
          <RadioGroup disabled>
            {["Only me", "Anyone in", "Ask me first"].map((label) => (
              <Field key={label} orientation="horizontal">
                <RadioGroupItem value={label} />
                <FieldLabel>
                  {label}
                  {label === "Anyone in" && <SkeletonText width="7rem" />}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </CallerPolicyCard>
        <AllowedCallersCard>
          <p className="text-sm">
            <SkeletonText width="10rem" />
          </p>
        </AllowedCallersCard>
      </div>
    </div>
  );
}

export function CallerSettingsView({
  settings,
  organizationName,
  saving,
  removing,
  error,
  onSave,
  onRemove,
}: {
  settings: AgentCallers;
  organizationName: string;
  saving: boolean;
  removing: boolean;
  error: Error | null;
  onSave: (policy: AgentCallerPolicy, onSuccess: () => void) => void;
  onRemove: (actorId: string, onSuccess: () => void) => void;
}) {
  const [draft, setDraft] = useState<AgentCallerPolicy | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [removed, setRemoved] = useState<AgentCallerView | null>(null);
  const policy = draft ?? settings.policy;
  const dirty = policy !== settings.policy;
  const save = () =>
    onSave(policy, () => {
      setDraft(null);
      setConfirm(false);
    });
  return (
    <>
      <UnsavedChangesGuard
        dirty={dirty}
        name="Agent callers"
        description="Your caller settings aren’t saved."
      />
      <CallerPolicyCard
        footer={
          <SettingsFooter
            dirty={dirty}
            pending={saving}
            error={
              error && actionErrorMessage(error, "We couldn’t save caller settings. Try again.")
            }
            onDiscard={() => setDraft(null)}
            onSave={() => (policy === "owner" ? save() : setConfirm(true))}
          />
        }
      >
        <RadioGroup
          value={policy}
          disabled={saving}
          onValueChange={(value) => {
            if (value === "owner" || value === "anyone" || value === "ask") setDraft(value);
          }}
          aria-label="Who can call this agent"
        >
          {(
            [
              ["owner", "Only me"],
              ["anyone", `Anyone in ${organizationName}`],
              ["ask", "Ask me first"],
            ] as const
          ).map(([value, label]) => (
            <Field key={value} orientation="horizontal">
              <RadioGroupItem id={`caller-${value}`} value={value} />
              <FieldLabel htmlFor={`caller-${value}`}>{label}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </CallerPolicyCard>
      <AllowedCallersCard>
        {!settings.allowlist.length && (
          <p className="text-sm text-muted-foreground">
            No allowed callers. Choose Always allow on a call in Needs you to add someone.
          </p>
        )}
        <ul className="divide-y">
          {settings.allowlist.map((caller) => (
            <li
              key={caller.actorId}
              className="group/row flex items-center justify-between gap-4 py-2"
            >
              <span className="text-sm">{caller.name}</span>
              <RowActions label={`Actions for ${caller.name}`}>
                <RowAction
                  destructive
                  label={`Remove ${caller.name}`}
                  disabled={removing}
                  onClick={() => setRemoved(caller)}
                >
                  <UserMinus />
                </RowAction>
              </RowActions>
            </li>
          ))}
        </ul>
      </AllowedCallersCard>
      {confirm && (
        <ConfirmDialog
          title="Allow workspace calls?"
          description="This agent works with your full access, not the caller’s access. It can read and change anything you can. Your instructions still apply."
          confirmLabel="Allow calls"
          pendingLabel="Saving…"
          pending={saving}
          error={error}
          errorDescription="We couldn’t save caller settings. Try again."
          onConfirm={save}
          onClose={() => setConfirm(false)}
        />
      )}
      {removed && (
        <ConfirmDialog
          destructive
          title={`Remove ${removed.name}?`}
          description="Future calls from this person will need approval under Ask me first. Queued calls will be checked again before they run."
          confirmLabel={`Remove ${removed.name}`}
          pendingLabel="Removing…"
          pending={removing}
          error={error}
          errorDescription="We couldn’t remove this caller. Try again."
          onConfirm={() => onRemove(removed.actorId, () => setRemoved(null))}
          onClose={() => setRemoved(null)}
        />
      )}
    </>
  );
}
