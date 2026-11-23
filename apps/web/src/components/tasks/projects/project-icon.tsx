import { Image } from "@/components/ui/image";
import { cn } from "cn";
import { FolderKanban } from "lucide-react";

export function ProjectIcon({ image, className }: { image?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 shrink-0 overflow-hidden rounded-sm text-muted-foreground",
        className,
      )}
    >
      <Image
        src={image}
        alt=""
        className="size-full object-cover"
        fallback={<FolderKanban className="size-full" />}
      />
    </span>
  );
}
