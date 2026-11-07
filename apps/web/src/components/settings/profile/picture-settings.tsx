import { FormMessage } from "../../auth/form-message";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { PictureUpload, type PictureUploadProps } from "../../upload/picture-upload";

export function PictureSettings({
  title,
  loading = false,
  error,
  onRetry,
  ...upload
}: PictureUploadProps & {
  title: string;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const blocked = isAccessFailure(error);
  return (
    <section className="space-y-3 border-b border-border py-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="space-y-3">
        {loading && (
          <LoadingState label={`Loading ${title.toLowerCase()}.`} variant="compact" rows={1} />
        )}
        {error && !blocked && upload.value !== undefined && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <FormMessage
                error={error}
                errorDescription={`Couldn't refresh ${title.toLowerCase()}. Your current picture is still available.`}
              />
            </div>
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {error && (blocked || upload.value === undefined) && (
          <ErrorState compact title={`Couldn't load ${title.toLowerCase()}`} onRetry={onRetry} />
        )}
        {!blocked &&
          (!loading || upload.value !== undefined) &&
          (!error || upload.value !== undefined) && <PictureUpload {...upload} />}
      </div>
    </section>
  );
}
