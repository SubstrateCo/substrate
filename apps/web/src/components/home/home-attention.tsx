import { Link } from "@tanstack/react-router";

import { HomeRows, type HomeSectionData } from "./home-section";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";
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
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
        <CheckCheck aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-sm font-medium">You’re caught up</h2>
        <p className="text-xs text-muted-foreground">
          No pending decisions or recent mentions here.
        </p>
      </div>
      <Button asChild variant="ghost" size="xs">
        <Link to="/notifications" search={{ workspaceId: organizationId }}>
          Notifications <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
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
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          quiet && "flex flex-col *:my-auto *:shrink-0",
        )}
        tabIndex={0}
        role="group"
        aria-label="Attention items"
      >
        {content}
      </CardContent>
    </Card>
  );
}
