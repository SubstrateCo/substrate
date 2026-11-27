import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
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
                {item.trailing && (
                  <ItemActions className="mt-1 md:hidden">
                    <span className="text-xs text-muted-foreground">{item.trailing}</span>
                  </ItemActions>
                )}
              </ItemContent>
              {item.trailing && (
                <ItemActions className="max-md:hidden">
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

/** What a section shows without items: a notice with a link, or its own content. */
export type HomeSectionEmpty =
  | {
      icon: LucideIcon;
      title: string;
      description?: string;
      action: string;
      /** Where the action goes, when not the header link. */
      link?: LinkProps;
    }
  | { content: ReactNode };

export function HomeSection({
  title,
  description,
  titleIcon,
  link,
  linkLabel,
  data,
  empty,
}: {
  title: string;
  description?: string;
  /** An icon before the title, such as `Hand` for what needs you. */
  titleIcon?: ReactNode;
  link: LinkProps;
  /** The header link's text. Without it, the link reads "View all". */
  linkLabel?: string;
  data: HomeSectionData;
  empty: HomeSectionEmpty;
}) {
  const noItems = !data.loading && !data.error && !data.items.length;
  let content =
    "content" in empty ? (
      empty.content
    ) : (
      <ContentNotice
        variant="compact"
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link {...(empty.link ?? link)}>
              {empty.action}
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
    content = (
      <ErrorState variant="compact" title="Couldn’t load this section" onRetry={data.onRetry} />
    );
  return (
    <Card size="sm" className="min-h-0 min-w-0 flex-1" role="region" aria-label={title}>
      {!noItems && (
        <CardHeader className="flex shrink-0 items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              <Heading level={2} variant="inherit" className="flex items-center gap-2">
                {titleIcon}
                {title}
              </Heading>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <Button asChild variant="ghost" size="xs">
            <Link {...link} aria-label={linkLabel ? undefined : `View all ${title.toLowerCase()}`}>
              {linkLabel ?? "View all"} <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        </CardHeader>
      )}
      <CardContent
        className="min-h-0 flex-1 overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label={`${title} items`}
      >
        {noItems ? (
          <div className="flex min-h-full items-center justify-center">{content}</div>
        ) : (
          content
        )}
      </CardContent>
    </Card>
  );
}
