import type { messageListInput, messageTargetInput } from "@substrate/contracts/messaging/input";

import { useState } from "react";
import { ActivityIndicator, Image, Platform, View } from "react-native";

import { NavigationSurface } from "@/components/gestures/navigation-surface";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { fileSize } from "@/features/messaging/format";
import { useAttachmentPreview } from "@/features/messaging/queries/use-attachment-preview";
import {
  shareAttachmentLabel,
  useShareAttachment,
} from "@/features/messaging/queries/use-attachment-share";
import type { MessageAttachment } from "@/features/messaging/types";
import { errorText } from "@/features/records/format";
import { Download, FileText, ImageOff, Share, X } from "lucide-react-native";
import type { z } from "zod";

type Target = z.input<typeof messageTargetInput> &
  Pick<z.input<typeof messageListInput>, "conversationId">;

function ImageAttachment({
  attachment,
  target,
}: {
  attachment: MessageAttachment;
  target: Target;
}) {
  const preview = useAttachmentPreview({ ...target, attachmentId: attachment.id }, true);
  const [viewing, setViewing] = useState(false);
  const share = useShareAttachment({ ...target, attachmentId: attachment.id }, attachment);
  return (
    <>
      <Button
        variant="ghost"
        accessibilityRole="imagebutton"
        accessibilityLabel={
          preview.error ? `Retry preview of ${attachment.filename}` : `View ${attachment.filename}`
        }
        onPress={() => (preview.error ? preview.retry() : preview.uri && setViewing(true))}
        className="size-40 items-center justify-center overflow-hidden rounded-md border border-border bg-muted p-0"
      >
        {preview.uri ? (
          <Image source={{ uri: preview.uri }} className="size-full" resizeMode="cover" />
        ) : null}
        {preview.error ? (
          <View className="items-center gap-1 p-2">
            <Icon as={ImageOff} className="size-5 text-muted-foreground" />
            <Text className="text-center text-xs text-muted-foreground">Tap to retry</Text>
          </View>
        ) : null}
        {preview.loading ? <ActivityIndicator /> : null}
      </Button>
      {viewing && preview.uri ? (
        <NavigationSurface
          side="right"
          fullScreen
          title={attachment.filename}
          onClose={() => setViewing(false)}
        >
          {(close) => (
            <View className="flex-1 bg-background">
              <View className="h-12 flex-row items-center border-b border-border px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={() => close()}
                  accessibilityLabel="Close image"
                >
                  <Icon as={X} className="size-5 text-foreground" />
                </Button>
                <Text className="flex-1 text-[15px] font-medium" numberOfLines={1}>
                  {attachment.filename}
                </Text>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={share.isPending}
                  onPress={() => share.mutate()}
                  accessibilityLabel={`${shareAttachmentLabel} ${attachment.filename}`}
                >
                  {share.isPending ? (
                    <ActivityIndicator />
                  ) : (
                    <Icon
                      as={Platform.OS === "web" ? Download : Share}
                      className="size-5 text-foreground"
                    />
                  )}
                </Button>
              </View>
              {share.error ? (
                <Text accessibilityRole="alert" className="px-4 py-2 text-sm text-destructive">
                  {errorText(
                    share.error,
                    "Couldn't get this file. Check your connection and access.",
                  )}
                </Text>
              ) : null}
              <Image
                source={{ uri: preview.uri }}
                className="flex-1"
                resizeMode="contain"
                accessibilityLabel={attachment.filename}
              />
            </View>
          )}
        </NavigationSurface>
      ) : null}
    </>
  );
}

/** Files on a message. Images show their server preview; every file can be shared or downloaded. */
export function MessageAttachments({
  attachments,
  target,
}: {
  attachments: MessageAttachment[];
  target: Target;
}) {
  if (!attachments.length) return null;
  const images = attachments.filter((item) => item.contentType.startsWith("image/"));
  const files = attachments.filter((item) => !item.contentType.startsWith("image/"));
  return (
    <View className="gap-2 pt-1">
      {images.length ? (
        <View className="flex-row flex-wrap gap-2">
          {images.map((attachment) => (
            <ImageAttachment key={attachment.id} attachment={attachment} target={target} />
          ))}
        </View>
      ) : null}
      {files.map((attachment) => (
        <FileAttachment key={attachment.id} attachment={attachment} target={target} />
      ))}
    </View>
  );
}

function FileAttachment({ attachment, target }: { attachment: MessageAttachment; target: Target }) {
  const share = useShareAttachment({ ...target, attachmentId: attachment.id }, attachment);
  const size = fileSize(attachment.size);
  return (
    <View className="gap-1">
      <Button
        variant="ghost"
        className="min-h-12 flex-row items-center justify-start gap-3 rounded-md border border-border px-3 py-2"
        disabled={share.isPending}
        accessibilityLabel={`${shareAttachmentLabel} ${attachment.filename}, ${size}`}
        onPress={() => share.mutate()}
      >
        <Icon as={FileText} className="size-4 text-muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm" numberOfLines={1}>
            {attachment.filename}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {share.isPending ? "Preparing file" : size}
          </Text>
        </View>
        {share.isPending ? (
          <ActivityIndicator />
        ) : (
          <Icon
            as={Platform.OS === "web" ? Download : Share}
            className="size-4 text-muted-foreground"
          />
        )}
      </Button>
      {share.error ? (
        <View accessibilityRole="alert" className="flex-row items-center gap-2 px-1">
          <Text className="flex-1 text-xs text-destructive">
            {errorText(share.error, "Couldn't get this file. Check your connection and access.")}
          </Text>
          <Button variant="ghost" size="sm" onPress={() => share.mutate()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
