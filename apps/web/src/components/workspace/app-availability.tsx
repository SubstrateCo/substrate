import type { AppId } from "@substrate/contracts/apps";
import { appScope } from "@substrate/contracts/apps";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { workspaceApps } from "@/components/workspace/workspace-apps";
import { Blocks } from "lucide-react";

export function AppAvailability({
  app,
  children,
  variant = "pane",
}: {
  app: AppId;
  children: ReactNode;
  variant?: "pane" | "compact";
}) {
  const apps = useOrganizationApps();
  if (apps.error) return <ErrorState title="Couldn’t load available apps" onRetry={apps.retry} />;
  if (!apps.ready) return <LoadingState label="Loading available apps" />;
  if (apps.enabled(app)) return children;
  const label = workspaceApps.find((item) => item.id === app)?.label ?? "This app";
  return (
    <ContentNotice
      variant={variant}
      icon={Blocks}
      title={`${label} is disabled`}
      description={
        appScope(app) === "user"
          ? "This personal app is not enabled for you in this workspace. Existing data is preserved. Enable it in Personal apps."
          : "This workspace app is disabled. Existing data is preserved. An owner or admin can enable it for everyone in Apps settings."
      }
      action={
        <Button variant="outline" asChild>
          <Link to="/settings/organization/apps">View apps</Link>
        </Button>
      }
    />
  );
}
