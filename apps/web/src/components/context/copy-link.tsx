import { useState } from "react";
import { Button } from "@startup-os/ui/primitives/button";

export function CopyLink({ href, label = "Copy link" }: { href: string; label?: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(new URL(href, window.location.origin).href).then(
            () => setStatus("Link copied"),
            () => setStatus("Couldn’t copy link"),
          );
        }}
      >
        {label}
      </Button>
      <span role="status" className="text-xs">
        {status}
      </span>
    </span>
  );
}
