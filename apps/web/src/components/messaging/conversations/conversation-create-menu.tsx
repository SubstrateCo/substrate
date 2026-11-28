import type { PickerAgent, PickerPerson } from "@substrate/contracts/people/picker";

import { useRef, useState, type ReactNode } from "react";

import { useWorkspaceSearch } from "@/components/context/search/workspace-search-request";
import { ActorAvatar } from "@/components/people/actor-avatar";
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
import { actorIdentity, actorLabel } from "@/lib/actors/identity";
import type { Conversation } from "@/lib/messaging/conversations";
import { Compass, MessageCircle, Plus, Users } from "lucide-react";

type Choice =
  | { kind: "create"; conversation: Conversation["kind"] }
  | { kind: "person"; person: PickerPerson }
  | { kind: "agent"; agent: PickerAgent };

function SectionAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
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
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChannelCreateActions({
  onCreate,
}: {
  onCreate: (kind: Conversation["kind"]) => void;
}) {
  const { openSearch } = useWorkspaceSearch();
  return (
    <span className="flex items-center gap-0.5">
      <SectionAction label="Browse channels" onClick={() => openSearch("channel")}>
        <Compass />
      </SectionAction>
      <SectionAction label="New channel" onClick={() => onCreate("channel")}>
        <Plus />
      </SectionAction>
    </span>
  );
}

export function DirectMessageCreateMenu({
  people = [],
  agents = [],
  onCreate,
  onMessagePerson,
  onMessageAgent,
}: {
  people?: PickerPerson[];
  agents?: PickerAgent[];
  onCreate: (kind: Conversation["kind"]) => void;
  onMessagePerson?: (person: PickerPerson) => void;
  onMessageAgent?: (agent: PickerAgent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = useRef<Choice | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
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
        collisionPadding={16}
        className="w-80"
        onCloseAutoFocus={(event) => {
          const choice = chosen.current;
          chosen.current = null;
          if (choice?.kind === "create") {
            event.preventDefault();
            trigger.current?.focus();
            onCreate(choice.conversation);
          } else if (choice?.kind === "person") onMessagePerson?.(choice.person);
          else if (choice?.kind === "agent") onMessageAgent?.(choice.agent);
        }}
      >
        <Command shouldFilter={false} loop>
          <div className="border-b p-2">
            <CommandInput
              aria-label="Search people"
              placeholder="Message someone"
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
                  <ActorAvatar actor={actorIdentity(person)} />
                  <span className="truncate font-medium">{person.name}</span>
                  {showEmail(person) && (
                    <span className="min-w-0 truncate text-muted-foreground">{person.email}</span>
                  )}
                </CommandItem>
              ))}
              {agentMatches.map((agent) => {
                const actor = actorIdentity({ ...agent, type: "agent" });
                return (
                  <CommandItem
                    key={agent.id}
                    value={`agent-${agent.id}`}
                    aria-label={actorLabel(actor)}
                    onSelect={() => choose({ kind: "agent", agent })}
                  >
                    <ActorAvatar actor={actor} />
                    <span className="truncate font-medium">{agent.name}</span>
                  </CommandItem>
                );
              })}
              {!matches.length && !agentMatches.length && (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  {search ? "No one here matches." : "No one else is in this workspace yet."}
                </p>
              )}
            </CommandGroup>
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
