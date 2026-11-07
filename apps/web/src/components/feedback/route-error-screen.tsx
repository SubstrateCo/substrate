import { useRouter } from "@tanstack/react-router";

import { ErrorScreen } from "@/components/feedback/error-screen";

export function RouteErrorScreen() {
  const router = useRouter();
  return <ErrorScreen onRetry={() => void router.invalidate()} />;
}
