import type { useMailPages } from "./mail-pages";
import { RowAction } from "@/components/layout/row-actions";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MailPagination({
  paging,
  onTurn,
}: {
  paging: ReturnType<typeof useMailPages>;
  onTurn: () => void;
}) {
  const { index, pending, more, issue } = paging;
  function status() {
    if (pending) return "Loading older mail…";
    if (issue === "reconnect") return "Reconnect Gmail to load more mail.";
    if (issue === "unavailable") return "Couldn’t load more mail. Choose Next to retry.";
    return more ? "" : "No more messages.";
  }
  return (
    <nav
      aria-label="Message pages"
      className="flex items-center justify-end gap-2 border-t px-3 py-1 text-xs text-muted-foreground"
    >
      <span role="status" className="mr-auto">
        {status()}
      </span>
      <RowAction
        label="Previous page"
        disabled={!index || pending}
        onClick={() => {
          onTurn();
          paging.previous();
        }}
      >
        <ChevronLeft aria-hidden />
      </RowAction>
      <span aria-current="page">Page {index + 1}</span>
      <RowAction
        label="Next page"
        disabled={pending || !more}
        onClick={() => {
          onTurn();
          void paging.next();
        }}
      >
        <ChevronRight aria-hidden />
      </RowAction>
    </nav>
  );
}
