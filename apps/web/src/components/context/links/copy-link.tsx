import { CopyLink as CopyLinkView } from "@/components/context/links/copy-link-view";

export function CopyLink({
  href,
  label = "Copy link",
  grouped,
}: {
  href: string;
  label?: string;
  grouped?: boolean;
}) {
  return (
    <CopyLinkView
      label={label}
      grouped={grouped}
      onCopy={() => navigator.clipboard.writeText(new URL(href, window.location.origin).href)}
    />
  );
}
