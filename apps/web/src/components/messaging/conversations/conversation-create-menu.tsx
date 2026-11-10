import { useRef, useState, type ReactNode } from "react";

import { useWorkspaceSearch } from "@/components/context/search/workspace-search-context";
import { PersonAvatar } from "@/components/people/person-avatar";
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
import type { PickerPerson } from "@/lib/people/people-picker";
import { Compass, MessageCircle, Plus, Users } from "lucide-react";

export type DirectMessageAgent = { id: string; name: string; image: string | null };

type Choice =
  | { kind: "create"; conversation: Conversation["kind"] }
  | { kind: "person"; person: PickerPerson }
  | { kind: "agent"; agent: DirectMessageAgent };

function SectionAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (button: HTMLButtonElement) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          className="[&_svg:not([class*='size-'])]:size-3.5"
          aria-label={label}
          onClick={(event) => onClick(event.currentTarget)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ConversationCreateMenu({
  section,
  people = [],
  agents = [],
  onCreate,
  onMessagePerson,
  onMessageAgent,
}: {
  section: "channel" | "dm";
  people?: PickerPerson[];
  agents?: DirectMessageAgent[];
  /** `launcher` is the button that opened the dialog, so closing it can return focus there. */
  onCreate: (kind: Conversation["kind"], launcher: HTMLElement | null) => void;
  onMessagePerson?: (person: PickerPerson) => void;
  onMessageAgent?: (agent: DirectMessageAgent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { openSearch } = useWorkspaceSearch();
  // Acts after the menu has returned focus to its trigger, so a dialog restores focus there.
  const chosen = useRef<Choice | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (section === "channel") {
    return (
      <span className="flex items-center gap-0.5">
        <SectionAction label="Browse channels" onClick={() => openSearch("channel")}>
          <Compass />
        </SectionAction>
        <SectionAction label="New channel" onClick={(button) => onCreate("channel", button)}>
          <Plus />
        </SectionAction>
      </span>
    );
  }
  const search = query.trim().toLowerCase();
  const matches = onMessagePerson
    ? people.filter(
        (person) =>
          !search ||
          person.name.toLowerCase().includes(search) ||
          person.email.toLowerCase().includes(search),
      )
    : [];
  const agentMatches = onMessageAgent
    ? agents.filter((agent) => !search || agent.name.toLowerCase().includes(search))
    : [];
  // The email tells two people with one name apart, or explains a match made on the address.
  const names = new Map<string, number>();
  for (const person of people) {
    const key = person.name.toLowerCase();
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  const showEmail = (person: PickerPerson) =>
    (names.get(person.name.toLowerCase()) ?? 0) > 1 ||
    (!!search && !person.name.toLowerCase().includes(search));
  const choose = (choice: Choice) => {
    chosen.current = choice;
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
              ref={trigger}
              size="icon-xs"
              variant="ghost"
              className="[&_svg:not([class*='size-'])]:size-3.5"
              aria-label="New message"
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
        onCloseAutoFocus={() => {
          const choice = chosen.current;
          chosen.current = null;
          if (choice?.kind === "create") onCreate(choice.conversation, trigger.current);
          else if (choice?.kind === "person") onMessagePerson?.(choice.person);
          else if (choice?.kind === "agent") onMessageAgent?.(choice.agent);
        }}
      >
        <Command shouldFilter={false} loop>
          <div className="border-b p-2">
            <CommandInput
              aria-label="Search people"
              placeholder="Message someone…"
              value={query}
              onValueChange={setQuery}
            />
          </div>
          <CommandList aria-label="New message" className="max-h-80">
            <CommandGroup heading="People">
              {matches.map((person) => (
                <CommandItem
                  key={person.id}
                  value={`person-${person.id}`}
                  onSelect={() => choose({ kind: "person", person })}
                >
                  <PersonAvatar name={person.name} image={person.image} />
                  <span className="truncate font-medium">{person.name}</span>
                  {showEmail(person) && (
                    <span className="min-w-0 truncate text-muted-foreground">{person.email}</span>
                  )}
                </CommandItem>
              ))}
              {!matches.length && (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  {search ? "No one here matches." : "No one else is in this workspace yet."}
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
                      onSelect={() => choose({ kind: "agent", agent })}
                    >
                      <PersonAvatar name={agent.name} image={agent.image} agent />
                      <span className="truncate font-medium">{agent.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            )}
            <div className="border-t">
              <CommandGroup>
                <CommandItem
                  value="new-direct-message"
                  onSelect={() => choose({ kind: "create", conversation: "dm" })}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                    <MessageCircle aria-hidden="true" />
                  </span>
                  <span className="truncate">New direct message</span>
                </CommandItem>
                <CommandItem
                  value="new-group-message"
                  onSelect={() => choose({ kind: "create", conversation: "group" })}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                    <Users aria-hidden="true" />
                  </span>
                  <span className="truncate">New group message</span>
                </CommandItem>
              </CommandGroup>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
