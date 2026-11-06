import { PendingButton } from "../feedback/pending-button";
import { FormMessage } from "../auth/form-message";

export function WorkspaceLinkPrompt({
  pending,
  error,
  onSwitch,
}: {
  pending: boolean;
  error?: Error | null;
  onSwitch: () => void;
}) {
  return (
    <section className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">This link belongs to another workspace</h1>
      <p>Switch to that workspace to open it. You must be a member.</p>
      <PendingButton pending={pending} pendingLabel="Switching workspace…" onClick={onSwitch}>
        Switch workspace to open link
      </PendingButton>
      <FormMessage
        error={error}
        errorDescription="This workspace is unavailable or you are not a member."
      />
    </section>
  );
}
