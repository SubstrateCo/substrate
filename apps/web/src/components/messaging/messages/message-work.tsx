import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { MessageWorkTile } from "./message-work-tile";

export type MessageWorkLink = {
  entityId: string;
  entityType: "task" | "project";
  title: string;
  href: string;
  statusName?: string | null;
  purpose: string;
  canRemove: boolean;
};

export function MessageWork({
  links,
  loading = false,
  error,
  onRetry,
  onRemove,
  removing = false,
}: {
  links: MessageWorkLink[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRemove?: (entityId: string) => void;
  removing?: boolean;
}) {
  if (!loading && !error && !links.length) return null;
  return (
    <section aria-label="Linked work" className="mt-3 max-w-lg space-y-2">
      {loading && <LoadingState label="Loading linked work" variant="compact" />}
      {error && <ErrorState compact title="Couldn’t load linked work" onRetry={onRetry} />}
      {(isAccessFailure(error) ? [] : links).map((link) => (
        <MessageWorkTile
          key={`${link.entityId}:${link.purpose}`}
          link={link}
          removing={removing}
          onRemove={onRemove}
        />
      ))}
    </section>
  );
}
