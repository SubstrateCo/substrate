import { Link } from "@tanstack/react-router";

import { HomeRows, type HomeSectionData } from "./home-section";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, CheckCheck, Hand } from "lucide-react";

export function HomeAttention({
  organizationId,
  data,
}: {
  organizationId: string;
  data: HomeSectionData;
}) {
  const quiet = !data.loading && !data.error && !data.items.length;
  let content = (
    <ContentNotice
      variant="compact"
      icon={CheckCheck}
      title="You’re caught up"
      description="No pending decisions or recent mentions here."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/notifications" search={{ workspaceId: organizationId }}>
            Notifications <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  );
  if (data.items.length) content = <HomeRows items={data.items} featured />;
  if (data.loading)
    content = <LoadingState label="Loading what needs you" variant="compact" rows={1} />;
  if (data.error)
    content = <ErrorState compact title="Couldn’t load what needs you" onRetry={data.onRetry} />;
  return (
    <Card
      size="sm"
      className="min-h-0 min-w-0 flex-1"
      role="region"
      aria-label="Needs your attention"
    >
      {!quiet && (
        <CardHeader className="flex shrink-0 items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle size="lg">
              <h2 className="flex items-center gap-2">
                <Hand aria-hidden="true" className="size-4 text-warning" />
                Needs your attention
              </h2>
            </CardTitle>
          </div>
          <Button asChild variant="ghost" size="xs">
            <Link to="/agents" search={{ workspaceId: organizationId }}>
              Agent requests <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
      )}
      <CardContent
        className="min-h-0 flex-1 overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label="Attention items"
      >
        {content}
      </CardContent>
    </Card>
  );
}
