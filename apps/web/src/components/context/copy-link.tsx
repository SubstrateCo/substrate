import { CopyLink as CopyLinkView } from "@/ui/context/copy-link";

export function CopyLink({ href, label = "Copy link" }: { href: string; label?: string }) {
  return (
    <CopyLinkView
      label={label}
      onCopy={() => navigator.clipboard.writeText(new URL(href, window.location.origin).href)}
    />
  );
}
