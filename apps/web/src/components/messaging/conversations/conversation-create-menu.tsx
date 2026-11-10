import { useRef, useState } from "react";

import { useWorkspaceSearch } from "@/components/context/search/workspace-search-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Conversation } from "@/lib/messaging/conversations";
import { initials } from "@/lib/people/initials";
import { AtSign, Bot, Compass, Plus, Users } from "lucide-react";

export type DirectMessagePerson = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type DirectMessageAgent = { id: string; name: string; image: string | null };

export function ConversationCreateMenu({
  section,
  people = [],
  agents = [],
  onCreate,
  onMessageAgent,
}: {
  section: "channel" | "dm";
  people?: DirectMessagePerson[];
  agents?: DirectMessageAgent[];
  onCreate: (kind: Conversation["kind"], recipient?: string) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { openSearch } = useWorkspaceSearch();
  const creatingFromMenu = useRef<{ kind: Conversation["kind"]; recipient?: string } | null>(null);
  const messagingAgent = useRef<DirectMessageAgent | null>(null);
  if (section === "channel") {
    return (
      <span className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Browse channels"
              onClick={() => openSearch("channel")}
            >
              <Compass />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Browse channels</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Create channel"
              data-create-conversation="sidebar-channel"
              onClick={() => onCreate("channel")}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Create channel</TooltipContent>
        </Tooltip>
      </span>
    );
  }
  const search = query.trim().toLowerCase();
  const matches = people.filter(
    (person) =>
      !search ||
      person.name.toLowerCase().includes(search) ||
      person.email.toLowerCase().includes(search),
  );
  const agentMatches = onMessageAgent
    ? agents.filter((agent) => !search || agent.name.toLowerCase().includes(search))
    : [];
  const choose = (kind: Conversation["kind"], recipient?: string) => {
    creatingFromMenu.current = { kind, recipient };
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="New message"
              data-create-conversation="sidebar-message"
            >
              <Plus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>New message</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        variant="reference"
        className="w-80"
        onCloseAutoFocus={(event) => {
          const pending = creatingFromMenu.current;
          const agent = messagingAgent.current;
          if (pending) {
            event.preventDefault();
            creatingFromMenu.current = null;
            onCreate(pending.kind, pending.recipient);
          } else if (agent) {
            event.preventDefault();
            messagingAgent.current = null;
            onMessageAgent?.(agent);
          }
        }}
      >
        <Command shouldFilter={false} loop>
          <div className="border-b p-2">
            <CommandInput
              aria-label="Search people"
              placeholder="Search people…"
              value={query}
              onValueChange={setQuery}
            />
          </div>
          <CommandList aria-label="New message" className="max-h-80">
            <div className="p-1">
              <CommandGroup heading="People in this workspace">
                {matches.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={`person-${person.id}`}
                    onSelect={() => choose("dm", person.email)}
                  >
                    <Avatar aria-hidden="true" variant="user">
                      {person.image && <AvatarImage src={person.image} alt="" />}
                      <AvatarFallback>{initials(person.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.email}
                      </span>
                    </span>
                  </CommandItem>
                ))}
                {!matches.length && (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    {search
                      ? "No one in this workspace matches. Message them by email below."
                      : "No other people in this workspace yet."}
                  </p>
                )}
              </CommandGroup>
              {agentMatches.length > 0 && (
                <div className="border-t">
                  <CommandGroup heading="Your agents">
                    {agentMatches.map((agent) => (
                      <CommandItem
                        key={agent.id}
                        value={`agent-${agent.id}`}
                        onSelect={() => {
                          messagingAgent.current = agent;
                          setOpen(false);
                        }}
                      >
                        <Avatar aria-hidden="true" variant="user">
                          {agent.image && <AvatarImage src={agent.image} alt="" />}
                          <AvatarFallback>
                            <Bot />
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{agent.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Runs on your desktop
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              )}
              <div className="border-t">
                <CommandGroup heading="More options">
                  <CommandItem value="new-direct-message" onSelect={() => choose("dm")}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <AtSign aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">New direct message</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Message anyone by email
                      </span>
                    </span>
                  </CommandItem>
                  <CommandItem value="new-group-message" onSelect={() => choose("group")}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Users aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">New group message</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Start a conversation with several people
                      </span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              </div>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
