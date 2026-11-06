import { useRef } from "react";

import type { Conversation } from "@/ui/messaging/types";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { Plus } from "lucide-react";

export function ConversationCreateMenu({
  section,
  onCreate,
}: {
  section: "channel" | "dm";
  onCreate: (kind: Conversation["kind"]) => void;
}) {
  const creatingFromMenu = useRef<Conversation["kind"] | null>(null);
  if (section === "channel") {
    return (
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Create channel"
        data-create-conversation="sidebar-channel"
        title="Create channel"
        onClick={() => onCreate("channel")}
      >
        <Plus />
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="New message"
          data-create-conversation="sidebar-message"
          title="New message"
        >
          <Plus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const kind = creatingFromMenu.current;
          if (kind) {
            event.preventDefault();
            creatingFromMenu.current = null;
            onCreate(kind);
          }
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            creatingFromMenu.current = "dm";
          }}
        >
          New direct message
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            creatingFromMenu.current = "group";
          }}
        >
          New group message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
