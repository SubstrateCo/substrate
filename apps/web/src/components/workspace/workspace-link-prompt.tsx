import { PendingButton } from "../feedback/pending-button";
import { FormMessage } from "@/components/feedback/form-message";
import { PageHeader } from "@/components/layout/page-header";

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
    <section className="space-y-6 p-6">
      <PageHeader
        title="This link belongs to another workspace"
        description="Switch to that workspace to open it. You must be a member."
      />
      <PendingButton pending={pending} onClick={onSwitch}>
        Switch workspace to open link
      </PendingButton>
      <FormMessage
        error={error}
        errorDescription="This workspace is unavailable or you are not a member."
      />
    </section>
  );
}
