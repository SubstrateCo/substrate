import { useState } from "react";

import { Button } from "../primitives/button";

export function CopyLink({
  onCopy,
  label = "Copy link",
}: {
  onCopy: () => Promise<void>;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          void onCopy().then(
            () => setStatus("Link copied"),
            () => setStatus("Couldn't copy link"),
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
