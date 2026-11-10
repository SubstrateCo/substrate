import { FormMessage } from "../../auth/form-message";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { SettingsCard } from "../../layout/settings-section";
import { Button } from "../../ui/button";
import { PictureUpload, type PictureUploadProps } from "../../upload/picture-upload";

/** A settings card for a profile picture or logo. Changes save as soon as the crop is saved. */
export function PictureSettings({
  title,
  description,
  loading = false,
  error,
  onRetry,
  ...upload
}: PictureUploadProps & {
  title: string;
  description: string;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const blocked = isAccessFailure(error);
  const subject = title.toLowerCase();
  return (
    <SettingsCard title={title} description={description}>
      {loading && upload.value === undefined && (
        <LoadingState label={`Loading ${subject}.`} variant="compact" rows={1} />
      )}
      {error && !blocked && upload.value !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <FormMessage
              error={error}
              errorDescription={`Couldn't refresh the ${subject}. The current one is still shown.`}
            />
          </div>
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {error && (blocked || upload.value === undefined) && (
        <ErrorState compact title={`Couldn't load the ${subject}`} onRetry={onRetry} />
      )}
      {!blocked &&
        (!loading || upload.value !== undefined) &&
        (!error || upload.value !== undefined) && <PictureUpload {...upload} />}
    </SettingsCard>
  );
}
