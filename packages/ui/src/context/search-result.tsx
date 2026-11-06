import { Button } from "../primitives/button";

export type SearchResultItem = { id: string; kind: string; title: string; href: string };

export function SearchResult({
  item,
  onRelated,
}: {
  item: SearchResultItem;
  onRelated: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <a
        className="min-w-0 flex-1 rounded border p-2 text-sm wrap-anywhere hover:bg-accent"
        href={item.href}
      >
        <span className="text-xs text-muted-foreground">{item.kind} · </span>
        {item.title.replace(/@\[[^\]]+\]/g, "[Reference]")}
      </a>
      <Button
        variant="outline"
        size="xs"
        aria-label={`Find related records for ${item.title.replace(/@\[[^\]]+\]/g, "[Reference]")}`}
        onClick={onRelated}
      >
        Related
      </Button>
    </li>
  );
}
