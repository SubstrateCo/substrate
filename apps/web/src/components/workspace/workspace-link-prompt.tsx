import { PendingButton } from "../feedback/pending-button";
import { FormMessage } from "@/components/feedback/form-message";
import { PageHeader } from "@/components/layout/page-header";
import { useMediaQuery } from "@/hooks/use-media-query";

export function WorkspaceLinkPrompt({
  pending,
  error,
  onSwitch,
}: {
  pending: boolean;
  error?: Error | null;
  onSwitch: () => void;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <section className="space-y-6 p-4 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto md:p-6">
      <PageHeader
        title="This link belongs to another workspace"
        description="Switch to that workspace to open it. You must be a member."
      />
      <PendingButton
        pending={pending}
        onClick={onSwitch}
        size={desktop ? "default" : "sm-wrap"}
        className="max-w-full"
      >
        Switch workspace to open link
      </PendingButton>
      <FormMessage
        error={error}
        errorDescription="This workspace is unavailable or you are not a member."
      />
    </section>
  );
}
