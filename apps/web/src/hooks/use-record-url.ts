import { useRouter } from "@tanstack/react-router";

import type { RecordLink } from "@/lib/navigation/record-links";

export function useRecordUrl() {
  const router = useRouter();
  return (link: RecordLink) =>
    new URL(router.buildLocation(link).href, window.location.origin).href;
}
