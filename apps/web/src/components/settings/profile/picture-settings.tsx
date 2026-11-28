import { ErrorState } from "../../feedback/error-state";
import {
  PictureUpload,
  PictureUploadLoading,
  type PictureUploadProps,
} from "../../upload/picture-upload";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { SettingsCard, SettingsDetail } from "@/components/layout/settings-section";
import type { ResourceStatus } from "@/lib/resource-state";

export function PictureSettings({
  title,
  state,
  description,
  onRetry,
  layout = "card",
  ...upload
}: PictureUploadProps & {
  title: string;
  state: ResourceStatus;
  description: string;
  onRetry: () => void;
  layout?: "card" | "row";
}) {
  const Frame = layout === "row" ? SettingsDetail : SettingsCard;
  return (
    <Frame title={title} description={description}>
      <PictureSettingsBody
        subject={title.toLowerCase()}
        state={state}
        onRetry={onRetry}
        upload={{ ...upload, framed: layout !== "row" }}
      />
    </Frame>
  );
}

function PictureSettingsBody({
  subject,
  state,
  onRetry,
  upload,
}: {
  subject: string;
  state: ResourceStatus;
  onRetry: () => void;
  upload: PictureUploadProps;
}) {
  switch (state) {
    case "loading":
      return (
        <PictureUploadLoading
          kind={upload.kind}
          framed={upload.framed}
          label={`Loading ${subject}`}
        />
      );
    case "error":
    case "unavailable":
      return (
        <ErrorState variant="compact" title={`Couldn’t load the ${subject}`} onRetry={onRetry} />
      );
    case "stale":
      return (
        <>
          <StaleNotice
            title={`Couldn’t refresh the ${subject}`}
            description="The current one is still shown."
            onRetry={onRetry}
          />
          <PictureUpload {...upload} />
        </>
      );
    case "ready":
      return <PictureUpload {...upload} />;
  }
}
