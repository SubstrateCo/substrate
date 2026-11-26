import { ErrorState } from "../../feedback/error-state";
import {
  PictureUpload,
  PictureUploadLoading,
  type PictureUploadProps,
} from "../../upload/picture-upload";
import { FormMessage } from "@/components/feedback/form-message";
import { SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import type { ResourceStatus } from "@/lib/resource-state";

/** A settings card for a profile picture or logo. Changes save as soon as the crop is saved. */
export function PictureSettings({
  title,
  state,
  description,
  loading = false,
  error,
  onRetry,
  ...upload
}: PictureUploadProps & {
  title: string;
  state: ResourceStatus;
  description: string;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const subject = title.toLowerCase();
  const loaded = upload.value !== undefined;
  let mode: "failed" | "loading" | "blocked" | "stale" | "ready" = "ready";
  if (error && (state === "unavailable" || !loaded)) mode = "failed";
  else if (loading && !loaded) mode = "loading";
  else if (state === "unavailable") mode = "blocked";
  else if (error) mode = "stale";
  return (
    <SettingsCard title={title} description={description}>
      {mode === "loading" && (
        <PictureUploadLoading kind={upload.kind} label={`Loading ${subject}`} />
      )}
      {mode === "failed" && (
        <ErrorState compact title={`Couldn’t load the ${subject}`} onRetry={onRetry} />
      )}
      {mode === "stale" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <FormMessage
              error={error}
              errorDescription={`Couldn’t refresh the ${subject}. The current one is still shown.`}
            />
          </div>
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {(mode === "stale" || mode === "ready") && <PictureUpload {...upload} />}
    </SettingsCard>
  );
}
