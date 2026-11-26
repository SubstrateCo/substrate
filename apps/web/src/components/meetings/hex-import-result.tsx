import type { importHex } from "@/api/meetings/requests";
import { FormMessage } from "@/components/feedback/form-message";

export function HexImportResult({
  error,
  report,
}: {
  error: Error | null;
  report: Awaited<ReturnType<typeof importHex>> | undefined;
}) {
  if (!error && !report) return null;
  return (
    <FormMessage
      error={error}
      errorDescription="Couldn’t import the file. Choose a complete Hex meeting Markdown export."
      message={
        report
          ? `Imported: ${report.added} new, ${report.updated} updated, ${report.linked} linked, ${report.unchanged} unchanged, ${report.review} to review.`
          : undefined
      }
    />
  );
}
