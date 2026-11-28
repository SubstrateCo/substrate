import { Share } from "react-native";

import { recordURL } from "./record-url";
import type { RecordTarget } from "./types";
import type { SheetAction } from "./ui/sheet";
import { captureToast } from "@/lib/toast";
import * as Clipboard from "expo-clipboard";

export function recordLinkActions(organizationId: string, record: RecordTarget): SheetAction[] {
  const run = async (operation: (url: string) => Promise<void>, success?: string) => {
    const feedback = captureToast();
    try {
      await operation(recordURL(organizationId, record, process.env.EXPO_PUBLIC_WEB_URL));
      if (success) feedback.success(success);
    } catch {
      feedback.error("Couldn't share this link. Try copying it instead.");
    }
  };
  return [
    {
      label: "Copy record link",
      onPress: () =>
        void run(async (url) => {
          await Clipboard.setStringAsync(url);
        }, "Link copied"),
    },
    {
      label: "Share record link",
      onPress: () =>
        void run(async (url) => {
          await Share.share({ message: url });
        }),
    },
  ];
}
