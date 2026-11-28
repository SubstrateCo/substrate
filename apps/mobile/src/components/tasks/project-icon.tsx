import { useEffect, useState } from "react";
import { Image } from "react-native";

import { loadPrivateImage } from "@/api/files/pictures";
import type { PrivateFile } from "@/api/files/resources";
import { onPrivateStateReset } from "@/auth/private-state";
import { Icon } from "@/components/ui/icon";
import type { QueryScope } from "@/queries/keys";
import { FolderKanban } from "lucide-react-native";

export function ProjectIcon({
  image,
  scope,
  large = false,
}: {
  image: string | null;
  scope: QueryScope;
  large?: boolean;
}) {
  const { userId, organizationId } = scope;
  const key = JSON.stringify([userId, organizationId, image]);
  const [loaded, setLoaded] = useState<{ key: string; file: PrivateFile }>();
  useEffect(() => {
    if (!image || !userId) return;
    const controller = new AbortController();
    let lease: PrivateFile | undefined;
    const stop = () => {
      controller.abort();
      lease?.release();
      setLoaded((current) => (current?.key === key ? undefined : current));
    };
    const unsubscribe = onPrivateStateReset(() => {
      stop();
    });
    void (async () => {
      try {
        const file = await loadPrivateImage(image, { userId, organizationId }, controller.signal);
        if (controller.signal.aborted) {
          file.release();
          return;
        }
        lease = file;
        setLoaded({ key, file });
      } catch {}
    })();
    return () => {
      unsubscribe();
      stop();
    };
  }, [image, userId, organizationId, key]);

  if (loaded?.key === key)
    return (
      <Image
        source={{ uri: loaded.file.uri }}
        accessibilityLabel="Project picture"
        className={large ? "size-12 rounded-md" : "size-4 rounded-sm"}
        onError={() => {
          loaded.file.release();
          setLoaded(undefined);
        }}
      />
    );
  return (
    <Icon
      as={FolderKanban}
      className={large ? "size-12 text-muted-foreground" : "size-4 text-muted-foreground"}
    />
  );
}
