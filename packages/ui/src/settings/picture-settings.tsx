import { Card, CardContent, CardHeader, CardTitle } from "../primitives/card";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { PictureUpload, type PictureUploadProps } from "../upload/picture-upload";

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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <LoadingState label={`Loading ${title.toLowerCase()}.`} variant="compact" rows={1} />
        )}
        {error && (
          <ErrorState compact title={`Couldn't load ${title.toLowerCase()}`} onRetry={onRetry} />
        )}
        {!loading && !blocked && (!error || upload.value !== undefined) && (
          <PictureUpload {...upload} />
        )}
      </CardContent>
    </Card>
  );
}
