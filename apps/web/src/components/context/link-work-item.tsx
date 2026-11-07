import { PendingButton } from "../feedback/pending-button";
import { Item, ItemActions, ItemContent } from "../ui/item";
import { Link2 } from "lucide-react";

export function LinkWorkItem({
  title,
  pending,
  disabled,
  onLink,
}: {
  title: string;
  pending: boolean;
  disabled: boolean;
  onLink: () => void;
}) {
  return (
    <Item asChild size="xs">
      <li>
        <ItemContent className="min-w-0 basis-32">
          <span className="line-clamp-2 text-sm wrap-anywhere" title={title}>
            {title}
          </span>
        </ItemContent>
        <ItemActions>
          <PendingButton
            size="xs"
            variant="outline"
            pending={pending}
            pendingLabel="Linking…"
            aria-label={pending ? `Linking ${title}.` : `Link ${title}`}
            disabled={disabled}
            onClick={onLink}
          >
            <Link2 aria-hidden="true" /> Link
          </PendingButton>
        </ItemActions>
      </li>
    </Item>
  );
}
