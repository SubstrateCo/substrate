import { createFileRoute } from "@tanstack/react-router";

import { DownloadScreen } from "@/components/onboarding/download-screen";

export const Route = createFileRoute("/_public/download")({ component: Download });

function Download() {
  return <DownloadScreen destination={Route.useSearch().redirect} />;
}
