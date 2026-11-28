import { Image } from "@/components/ui/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/people/initials";

export function WorkspaceTile({
  name,
  logo,
  opening = false,
}: {
  name?: string;
  logo?: string | null;
  opening?: boolean;
}) {
  if (name === undefined)
    return (
      <span className="size-8 shrink-0 overflow-hidden rounded-lg">
        <Skeleton className="size-full" />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      // oxlint-disable-next-line design/no-decorative-class -- Initials.
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-xs font-semibold text-foreground shadow-surface"
    >
      {opening ? (
        <Spinner aria-hidden="true" role="presentation" />
      ) : (
        <Image
          src={logo}
          className="size-full rounded-lg object-contain"
          fallback={initials(name)}
        />
      )}
    </span>
  );
}
