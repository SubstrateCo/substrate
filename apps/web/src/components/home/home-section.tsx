import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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

function HomeRows({ items }: { items: HomeItem[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <Item asChild size="xs">
            <Link {...item.link} title={item.title}>
              <ItemMedia className="relative">
                <span className="text-muted-foreground">{item.icon}</span>
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full">{item.title}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
              </ItemContent>
              {item.trailing && (
                <ItemActions>
                  <span className="text-xs text-muted-foreground">{item.trailing}</span>
                </ItemActions>
              )}
            </Link>
          </Item>
        </li>
      ))}
    </ul>
  );
}

export function HomeSection({
  title,
  description,
  icon,
  titleIcon,
  emptyTitle,
  emptyDescription,
  link,
  linkLabel,
  emptyLink = link,
  data,
  emptyAction,
  emptyContent,
  hideHeaderWhenEmpty = false,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  /** An icon before the title, such as `Hand` for what needs you. */
  titleIcon?: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  link: LinkProps;
  /** The header link's text. Without it, the link reads "View all". */
  linkLabel?: string;
  /** Where the empty state's action goes, when not the header link. */
  emptyLink?: LinkProps;
  data: HomeSectionData;
  emptyAction: string;
  emptyContent?: ReactNode;
  /** A quiet section shows only its empty state. */
  hideHeaderWhenEmpty?: boolean;
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
          <Link {...emptyLink}>
            {emptyAction}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      }
    />
  );
  if (data.items.length) content = <HomeRows items={data.items} />;
  if (data.loading)
    content = <LoadingState label={`Loading ${title.toLowerCase()}`} variant="compact" rows={3} />;
  if (data.error)
    content = <ErrorState compact title="Couldn’t load this section" onRetry={data.onRetry} />;
  return (
    <Card size="sm" className="min-h-0 min-w-0 flex-1" role="region" aria-label={title}>
      {!(empty && hideHeaderWhenEmpty) && (
        <CardHeader className="flex shrink-0 items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              <h2 className="flex items-center gap-2">
                {titleIcon}
                {title}
              </h2>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {!empty && (
            <Button asChild variant="ghost" size="xs">
              <Link
                {...link}
                aria-label={linkLabel ? undefined : `View all ${title.toLowerCase()}`}
              >
                {linkLabel ?? "View all"} <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          )}
        </CardHeader>
      )}
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
