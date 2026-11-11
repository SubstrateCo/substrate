import { useRouter } from "@tanstack/react-router";

import type { RecordLink } from "@/lib/navigation/record-links";

/** The absolute URL of a record link, to copy and share. */
export function useRecordUrl() {
  const router = useRouter();
  return (link: RecordLink) =>
    new URL(router.buildLocation(link).href, window.location.origin).href;
}
