import { ErrorState } from "../../feedback/error-state";
import { SettingsCard } from "../../layout/settings-section";
import { Button } from "../../ui/button";
import {
  PictureUpload,
  PictureUploadLoading,
  type PictureUploadProps,
} from "../../upload/picture-upload";
import { FormMessage } from "@/components/feedback/form-message";
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
  const blocked = state === "unavailable";
  const subject = title.toLowerCase();
  return (
    <SettingsCard title={title} description={description}>
      {loading && upload.value === undefined && (
        <PictureUploadLoading kind={upload.kind} label={`Loading ${subject}`} />
      )}
      {error && !blocked && upload.value !== undefined && (
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
      {error && (blocked || upload.value === undefined) && (
        <ErrorState compact title={`Couldn’t load the ${subject}`} onRetry={onRetry} />
      )}
      {!blocked &&
        (!loading || upload.value !== undefined) &&
        (!error || upload.value !== undefined) && <PictureUpload {...upload} />}
    </SettingsCard>
  );
}
