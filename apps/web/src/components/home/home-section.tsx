import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type HomeItem = {
  id: string;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  link: LinkProps;
  trailing?: ReactNode;
};

export type HomeSectionData = {
  items: HomeItem[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
};

export function HomeRows({
  items,
  featured = false,
  compact = false,
}: {
  items: HomeItem[];
  featured?: boolean;
  compact?: boolean;
}) {
  return (
    <ul className={featured ? "grid gap-3 lg:grid-cols-2" : "divide-y"}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            {...item.link}
            title={item.title}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-md px-3 text-sm outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "py-2" : "py-3",
              featured && "items-start rounded-lg border bg-muted/20",
            )}
          >
            <span className="relative flex size-8 shrink-0 items-center justify-center text-muted-foreground">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className={cn("block font-medium", featured ? "line-clamp-2" : "truncate")}>
                {item.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
            {item.trailing && !featured && (
              <span className="shrink-0 text-xs text-muted-foreground">{item.trailing}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HomeSection({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  link,
  data,
  emptyAction,
  emptyContent,
  emphasis = false,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  link: LinkProps;
  data: HomeSectionData;
  emptyAction: string;
  emptyContent?: ReactNode;
  emphasis?: boolean;
}) {
  const empty = !data.loading && !data.error && !data.items.length;
  let content = emptyContent ?? (
    <ContentNotice
      variant="compact"
      icon={icon}
      title={emptyTitle}
      description={emptyDescription}
      action={
        <Button variant="outline" size="sm" asChild>
          <Link {...link}>
            {emptyAction}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  );
  if (data.items.length) content = <HomeRows items={data.items} compact={!emphasis} />;
  if (data.loading)
    content = <LoadingState label={`Loading ${title.toLowerCase()}`} variant="compact" rows={3} />;
  if (data.error)
    content = <ErrorState compact title="Couldn’t load this section" onRetry={data.onRetry} />;
  return (
    <Card size="sm" className="min-h-0 min-w-0 flex-1" role="region" aria-label={title}>
      <CardHeader className="flex shrink-0 items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle size={emphasis ? "lg" : undefined}>
            <h2>{title}</h2>
          </CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {!empty && (
          <Button asChild variant="ghost" size="xs">
            <Link {...link} aria-label={`View all ${title.toLowerCase()}`}>
              View all <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent
        className="min-h-0 flex-1 overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label={`${title} items`}
      >
        {content}
      </CardContent>
    </Card>
  );
}
