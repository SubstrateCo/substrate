import { useEffect, useState } from "react";

import { authClient } from "@/api/auth-client";
import { loadPrivateImage } from "@/api/files/pictures";
import type { PrivateFile } from "@/api/files/resources";
import { onPrivateStateReset } from "@/auth/private-state";

type Lease = { file: Promise<PrivateFile>; controller: AbortController; users: number };

// Avatars of one person share a single download and file while any of them is mounted. The last
// one to unmount releases it; a private-state reset releases every file.
const leases = new Map<string, Lease>();
onPrivateStateReset(() => {
  for (const lease of leases.values()) lease.controller.abort();
  leases.clear();
});

function acquire(key: string, path: string, userId: string) {
  let lease = leases.get(key);
  if (!lease) {
    const controller = new AbortController();
    // A picture that is not on this server's managed paths throws here; it shows initials.
    let file: Promise<PrivateFile>;
    try {
      file = loadPrivateImage(path, { userId, organizationId: null }, controller.signal);
    } catch (error) {
      file = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const created: Lease = { file, controller, users: 0 };
    leases.set(key, created);
    file.catch(() => {
      if (leases.get(key) === created) leases.delete(key);
    });
    lease = created;
  }
  lease.users += 1;
  const owned = lease;
  return {
    file: owned.file,
    release() {
      owned.users -= 1;
      if (owned.users > 0) return;
      if (leases.get(key) === owned) leases.delete(key);
      owned.controller.abort();
      owned.file.then((file) => file.release()).catch(() => undefined);
    },
  };
}

/**
 * A profile picture's local URI, or nothing while it loads or fails. The bytes come through the
 * authenticated byte route, so no image request carries the session or follows a storage redirect.
 */
export function useProfilePicture(path: string | null | undefined) {
  const userId = authClient.useSession().data?.user.id;
  const [loaded, setLoaded] = useState<{ key: string; uri: string }>();
  const key = path && userId ? `${userId}:${path}` : undefined;
  useEffect(() => {
    if (!key || !path || !userId) return;
    let active = true;
    const lease = acquire(key, path, userId);
    lease.file.then(
      (file) => active && setLoaded({ key, uri: file.uri }),
      () => undefined,
    );
    return () => {
      active = false;
      lease.release();
    };
  }, [key, path, userId]);
  return key && loaded?.key === key ? loaded.uri : undefined;
}
